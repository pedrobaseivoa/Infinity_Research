'use client'

import { useState } from 'react'
import { toPng } from 'html-to-image'
import { CameraIcon } from '@heroicons/react/24/outline'

interface ScreenshotButtonProps {
    targetId: string
    filename: string
    className?: string
    label?: string
}

export default function ScreenshotButton({ targetId, filename, className = '', label = 'Export PNG' }: ScreenshotButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        const element = document.getElementById(targetId)
        if (!element) return

        setLoading(true)
        try {
            const pixelRatio = 3

            const dataUrl = await toPng(element, {
                cacheBust: true,
                pixelRatio,
                backgroundColor: '#ffffff',
                filter: (node: HTMLElement) => {
                    if (node.classList?.contains('screenshot-exclude')) return false
                    return true
                },
                onClone: (_: Node, clonedEl: HTMLElement) => {
                    const root = clonedEl

                    root.style.backgroundColor = '#ffffff'
                    root.style.padding = '24px'
                    root.style.borderRadius = '0'
                    root.style.border = 'none'
                    root.style.overflow = 'visible'

                    const all = root.querySelectorAll('*')
                    all.forEach((el) => {
                        const h = el as HTMLElement
                        const cls = typeof h.className === 'string' ? h.className : ''

                        h.style.overflow = 'visible'

                        const computed = window.getComputedStyle(h)
                        const bgColor = computed.backgroundColor

                        if (cls.includes('bg-emerald-500')) { h.style.backgroundColor = '#10b981'; }
                        else if (cls.includes('bg-emerald-600')) { h.style.backgroundColor = '#059669'; }
                        else if (cls.includes('bg-emerald-700')) { h.style.backgroundColor = '#6ee7b7'; }
                        else if (cls.includes('bg-blue-500')) { /* keep */ }
                        else if (cls.includes('bg-green-500')) { /* keep */ }
                        else if (cls.includes('bg-red-500')) { /* keep */ }
                        else if (bgColor && (bgColor.startsWith('rgba') || bgColor.startsWith('rgb'))) {
                            const m = bgColor.match(/\d+/g)
                            if (m) {
                                const r = parseInt(m[0]), g = parseInt(m[1]), b = parseInt(m[2])
                                const brightness = (r * 299 + g * 587 + b * 114) / 1000
                                if (brightness < 40) h.style.backgroundColor = '#ffffff'
                                else if (brightness < 80) h.style.backgroundColor = '#f9fafb'
                            }
                        }

                        if (cls.includes('text-white')) h.style.color = '#111827'
                        if (cls.includes('text-gray-3') || cls.includes('text-gray-4')) h.style.color = '#374151'
                        if (cls.includes('text-gray-5') || cls.includes('text-gray-6')) h.style.color = '#6b7280'

                        if (cls.includes('text-green-4')) h.style.color = '#059669'
                        if (cls.includes('text-blue-4')) h.style.color = '#2563eb'
                        if (cls.includes('text-purple-4')) h.style.color = '#7c3aed'
                        if (cls.includes('text-amber-4')) h.style.color = '#d97706'
                        if (cls.includes('text-cyan-4')) h.style.color = '#0891b2'
                        if (cls.includes('text-red-4')) h.style.color = '#dc2626'
                        if (cls.includes('text-yellow-4')) h.style.color = '#ca8a04'
                        if (cls.includes('text-emerald-2') || cls.includes('text-emerald-3')) h.style.color = '#065f46'
                        if (cls.includes('text-emerald-4')) h.style.color = '#059669'
                        if (cls.includes('text-orange-4')) h.style.color = '#ea580c'

                        if (cls.includes('border-gray')) h.style.borderColor = '#e5e7eb'

                        const tags = ['TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']
                        if (tags.includes(h.tagName)) {
                            h.style.backgroundColor = '#ffffff'
                            h.style.color = '#111827'
                            h.style.borderColor = '#d1d5db'
                        }

                        if (h.tagName === 'TH') {
                            h.style.backgroundColor = '#f3f4f6'
                            h.style.fontWeight = '600'
                        }
                    })

                    const svgTexts = root.querySelectorAll('svg text, svg tspan')
                    svgTexts.forEach((t) => {
                        const el = t as SVGElement
                        const fill = el.getAttribute('fill') || el.style.fill
                        if (fill === '#6b7280' || fill === '#9ca3af' || fill === 'rgb(107, 114, 128)' || fill === 'rgb(156, 163, 175)') {
                            el.setAttribute('fill', '#374151')
                            el.style.fill = '#374151'
                        }
                    })

                    const svgLines = root.querySelectorAll('svg line, svg path')
                    svgLines.forEach((l) => {
                        const el = l as SVGElement
                        const stroke = el.getAttribute('stroke')
                        if (stroke === '#1f2937' || stroke === '#374151') {
                            el.setAttribute('stroke', '#e5e7eb')
                        }
                    })
                },
            } as any)

            const link = document.createElement('a')
            link.download = `${filename}.png`
            link.href = dataUrl
            link.click()
        } catch (err) {
            console.error('Failed to generate screenshot:', err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleDownload}
            disabled={loading}
            className={`screenshot-exclude flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors border border-blue-500/20 ${className}`}
            title="Download Chart as PNG"
        >
            <CameraIcon className="w-4 h-4" />
            {loading ? 'Saving...' : label}
        </button>
    )
}
