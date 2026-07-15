'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COST_ESTIMATE_PER_ARTICLE } from '@/lib/processing/models';

interface QueueState {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  estimatedCost: number;
  isRunning: boolean;
  globalProcessing: number;
}

const MAX_CONCURRENT = 3;
const TOTAL_PHASES = 7;

export function useProcessingQueue(userId: string | null, folderId?: string | null) {
  const [state, setState] = useState<QueueState>({
    queued: 0, processing: 0, completed: 0, failed: 0, total: 0,
    estimatedCost: 0, isRunning: false, globalProcessing: 0,
  });
  const [configName, setConfigName] = useState<string>('');

  const isRunningRef = useRef(false);
  const configNameRef = useRef('');
  const folderIdRef = useRef(folderId);
  const activeDrivesRef = useRef<Set<string>>(new Set());
  const processNextLockRef = useRef(false);
  const supabase = createClient();

  useEffect(() => { folderIdRef.current = folderId; }, [folderId]);

  const updateConfigName = useCallback((name: string) => {
    setConfigName(name);
    configNameRef.current = name;
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!userId) return;

    let query = supabase.from('articles').select('status').eq('user_id', userId).in('status', ['queued', 'processing', 'completed', 'failed']);
    const currentFolder = folderIdRef.current;
    if (currentFolder !== undefined && currentFolder !== null) query = query.eq('folder_id', currentFolder);
    else if (currentFolder === null) query = query.is('folder_id', null);

    const [{ data }, { count: gp }] = await Promise.all([
      query,
      supabase.from('articles').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'processing'),
    ]);

    if (!data) return;
    const counts = { queued: 0, processing: 0, completed: 0, failed: 0 };
    data.forEach(a => { counts[a.status as keyof typeof counts]++; });

    setState(prev => ({
      ...prev, ...counts,
      total: data.length,
      estimatedCost: counts.queued * COST_ESTIMATE_PER_ARTICLE,
      globalProcessing: gp ?? 0,
    }));
  }, [userId, supabase]);

  /**
   * Drive a single article through all 7 phases sequentially.
   * Each phase is a separate HTTP call (~30-120s each).
   */
  const driveArticle = useCallback(async (articleId: string, cfgName: string, startPhase = 1) => {
    if (activeDrivesRef.current.has(articleId)) return;
    activeDrivesRef.current.add(articleId);

    try {
      for (let phase = startPhase; phase <= TOTAL_PHASES; phase++) {
        if (!isRunningRef.current) break;

        const res = await fetch('/api/process-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articleId,
            phase,
            configName: cfgName === 'default' ? '' : cfgName,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error(`Phase ${phase} failed for ${articleId}:`, err.error);
          break;
        }
      }
    } catch (err) {
      console.error(`Drive failed for ${articleId}:`, err);
    } finally {
      activeDrivesRef.current.delete(articleId);
      refreshCounts();
    }
  }, [refreshCounts]);

  /**
   * Find the next phase to run for a processing article by checking phaseN_status fields.
   */
  const getResumePhase = useCallback((article: Record<string, unknown>): number => {
    for (let p = TOTAL_PHASES; p >= 1; p--) {
      if (article[`phase${p}_status`] === 'completed') return p + 1;
    }
    return 1;
  }, []);

  const processNext = useCallback(async () => {
    if (!userId || !isRunningRef.current) return;
    if (processNextLockRef.current) return;
    processNextLockRef.current = true;

    try {
      const activeCount = activeDrivesRef.current.size;
      if (activeCount >= MAX_CONCURRENT) return;

      const slotsAvailable = MAX_CONCURRENT - activeCount;
      const currentFolder = folderIdRef.current;
      const cfgName = configNameRef.current || 'default';

      // 1. Pick up queued articles
      let queuedQuery = supabase.from('articles').select('id')
        .eq('user_id', userId).eq('status', 'queued')
        .order('queued_at', { ascending: true }).limit(slotsAvailable);

      if (currentFolder !== undefined && currentFolder !== null) queuedQuery = queuedQuery.eq('folder_id', currentFolder);
      else if (currentFolder === null) queuedQuery = queuedQuery.is('folder_id', null);

      const { data: queued } = await queuedQuery;

      // 2. Pick up processing articles that need resuming (not actively driven)
      let resumeQuery = supabase.from('articles')
        .select('id, current_phase, phase1_status, phase2_status, phase3_status, phase4_status, phase5_status, phase6_status, phase7_status')
        .eq('user_id', userId).eq('status', 'processing')
        .limit(slotsAvailable);

      if (currentFolder !== undefined && currentFolder !== null) resumeQuery = resumeQuery.eq('folder_id', currentFolder);
      else if (currentFolder === null) resumeQuery = resumeQuery.is('folder_id', null);

      const { data: processing } = await resumeQuery;
      const resumable = processing?.filter(a => !activeDrivesRef.current.has(a.id)) || [];

      const totalToStart = (queued?.length || 0) + resumable.length;
      if (totalToStart === 0) {
        if (activeCount === 0) {
          isRunningRef.current = false;
          setState(prev => ({ ...prev, isRunning: false }));
        }
        return;
      }

      // Start queued articles from phase 1
      for (const article of (queued || [])) {
        if (activeDrivesRef.current.size >= MAX_CONCURRENT) break;
        await supabase.from('articles').update({ pipeline_config: cfgName }).eq('id', article.id);
        driveArticle(article.id, cfgName, 1);
      }

      // Resume processing articles from their next phase
      for (const article of resumable) {
        if (activeDrivesRef.current.size >= MAX_CONCURRENT) break;
        const resumePhase = getResumePhase(article as Record<string, unknown>);
        if (resumePhase <= TOTAL_PHASES) {
          driveArticle(article.id, cfgName, resumePhase);
        }
      }

      setTimeout(() => refreshCounts(), 2000);
    } finally {
      processNextLockRef.current = false;
    }
  }, [userId, supabase, driveArticle, getResumePhase, refreshCounts]);

  const startQueue = useCallback(() => {
    isRunningRef.current = true;
    setState(prev => ({ ...prev, isRunning: true }));
    processNext();
  }, [processNext]);

  const stopQueue = useCallback(() => {
    isRunningRef.current = false;
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const detectStuck = useCallback(async () => {
    if (!userId) return;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase.from('articles').select('id')
      .eq('user_id', userId).eq('status', 'processing').lt('updated_at', tenMinutesAgo);
    if (stuck && stuck.length > 0) {
      for (const article of stuck) {
        if (!activeDrivesRef.current.has(article.id)) {
          await supabase.from('articles').update({ status: 'failed', error_message: 'Processing timeout' }).eq('id', article.id);
        }
      }
    }
  }, [userId, supabase]);

  const prevFolderRef = useRef(folderId);
  useEffect(() => {
    if (prevFolderRef.current !== folderId) {
      prevFolderRef.current = folderId;
      refreshCounts();
    }
  }, [folderId, refreshCounts]);

  useEffect(() => {
    if (!userId) return;
    detectStuck();
    refreshCounts();

    const channel = supabase.channel('queue-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles', filter: `user_id=eq.${userId}` }, () => {
        refreshCounts();
        if (isRunningRef.current) setTimeout(processNext, 1000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, detectStuck, refreshCounts, processNext]);

  useEffect(() => {
    if (!state.isRunning) return;
    const interval = setInterval(() => {
      if (isRunningRef.current) { refreshCounts(); processNext(); }
    }, 5000);
    return () => clearInterval(interval);
  }, [state.isRunning, refreshCounts, processNext]);

  return { ...state, startQueue, stopQueue, refreshCounts, configName, setConfigName: updateConfigName };
}
