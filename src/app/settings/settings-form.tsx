'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'

interface SettingsFormProps {
    initialSettings: {
        openrouter_api_key: string
        semantic_scholar_api_key: string
        openalex_api_key: string
        core_api_key: string
    }
    readOnly?: boolean
}

type ValidationStatus = 'idle' | 'testing' | 'valid' | 'invalid'

export default function SettingsForm({ initialSettings, readOnly = false }: SettingsFormProps) {
    const [settings, setSettings] = useState(initialSettings)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [validation, setValidation] = useState<Record<string, { status: ValidationStatus; error?: string }>>({})
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (readOnly) return
        if (settings.openrouter_api_key && validation['openrouter_api_key']?.status !== 'valid') {
            setMessage({ type: 'error', text: 'Please test your OpenRouter API key before saving' })
            return
        }
        setLoading(true); setMessage(null)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setMessage({ type: 'error', text: 'Not authenticated' }); return }
            const { error } = await supabase.from('user_settings').upsert({
                user_id: user.id,
                openrouter_api_key: settings.openrouter_api_key || null,
                semantic_scholar_api_key: settings.semantic_scholar_api_key || null,
                openalex_api_key: settings.openalex_api_key || null,
                core_api_key: settings.core_api_key || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            if (error) throw error
            setMessage({ type: 'success', text: 'Settings saved' })
        } catch (error: any) { setMessage({ type: 'error', text: error.message }) }
        finally { setLoading(false) }
    }

    const updateField = (field: string, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }))
        setValidation(prev => ({ ...prev, [field]: { status: 'idle' } }))
    }

    const validateKey = async (field: string, provider: string) => {
        const key = (settings as any)[field]
        if (!key) return
        setValidation(prev => ({ ...prev, [field]: { status: 'testing' } }))
        try {
            const response = await fetch('/api/settings/validate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key })
            })
            const data = await response.json()
            setValidation(prev => ({ ...prev, [field]: { status: data.valid ? 'valid' : 'invalid', error: data.error } }))
        } catch (error: any) {
            setValidation(prev => ({ ...prev, [field]: { status: 'invalid', error: error.message } }))
        }
    }

    const fields = [
        { key: 'openrouter_api_key', provider: 'openrouter', label: 'OpenRouter', required: true, placeholder: 'sk-or-...', link: 'https://openrouter.ai/keys', linkLabel: 'openrouter.ai/keys' },
        { key: 'semantic_scholar_api_key', provider: 'semantic_scholar', label: 'Semantic Scholar', required: false, placeholder: 'Optional', hint: 'Improves citation data' },
        { key: 'openalex_api_key', provider: 'openalex', label: 'OpenAlex', required: false, placeholder: 'Optional (email works)', hint: 'Polite pool access' },
        { key: 'core_api_key', provider: 'core', label: 'CORE', required: false, placeholder: 'Optional', link: 'https://core.ac.uk/services/api', linkLabel: 'core.ac.uk' },
    ]

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map(f => {
                const v = validation[f.key]
                const value = (settings as any)[f.key] || ''
                return (
                    <div key={f.key} className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-200">
                                {f.label}
                                {f.required && <span className="text-red-400 ml-1">*</span>}
                                {!f.required && <span className="text-gray-600 text-xs ml-2">optional</span>}
                            </label>
                            {v?.status === 'valid' && <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Valid</span>}
                            {v?.status === 'invalid' && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" /> {v.error || 'Invalid'}</span>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={value}
                                onChange={e => updateField(f.key, e.target.value)}
                                disabled={readOnly}
                                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
                                placeholder={f.placeholder}
                            />
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={() => validateKey(f.key, f.provider)}
                                    disabled={!value || v?.status === 'testing'}
                                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-medium rounded-lg transition-colors border border-gray-700 flex items-center gap-1.5"
                                >
                                    {v?.status === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
                                </button>
                            )}
                        </div>
                        {(f.hint || f.link) && (
                            <p className="mt-1.5 text-[11px] text-gray-600">
                                {f.hint}
                                {f.hint && f.link && ' · '}
                                {f.link && (
                                    <a href={f.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                                        {f.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                )}
                            </p>
                        )}
                    </div>
                )
            })}

            {message && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {message.text}
                </div>
            )}

            {!readOnly && (
                <button
                    type="submit"
                    disabled={loading || !settings.openrouter_api_key}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {loading ? 'Saving...' : 'Save Settings'}
                </button>
            )}
        </form>
    )
}
