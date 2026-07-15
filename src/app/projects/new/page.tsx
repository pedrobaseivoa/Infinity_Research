'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

// -- Types --
type WizardStep = 1 | 2 | 3

interface ProjectData {
    name: string
    description: string
    sources: { [key: string]: boolean }
    queries: { [key: string]: string }
    yearStart: string
    yearEnd: string
    // Step 2 placeholders
    scientificSchema: any[]
    prompt: string
}

const SOURCES_LIST = [
    { id: 'pubmed', label: 'PubMed' },
    { id: 'openalex', label: 'OpenAlex' },
    { id: 'crossref', label: 'Crossref' },
    { id: 'europe_pmc', label: 'Europe PMC' },
    { id: 'arxiv', label: 'arXiv' },
    { id: 'semantic_scholar', label: 'Semantic Scholar' },
    { id: 'doaj', label: 'DOAJ' },
    { id: 'core', label: 'CORE' },
]

export default function NewProjectWizard() {
    const router = useRouter()
    const [step, setStep] = useState<WizardStep>(1)
    const [isLoading, setIsLoading] = useState(false)

    // State
    const [data, setData] = useState<ProjectData>({
        name: '',
        description: '',
        sources: { pubmed: true, openalex: true }, // Defaults
        queries: {},
        yearStart: '2020',
        yearEnd: new Date().getFullYear().toString(),
        scientificSchema: [],
        prompt: ''
    })

    // Handlers
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setData(prev => ({ ...prev, [name]: value }))
    }

    const handleSourceToggle = (sourceId: string) => {
        setData(prev => ({
            ...prev,
            sources: {
                ...prev.sources,
                [sourceId]: !prev.sources[sourceId]
            }
        }))
    }

    const handleQueryChange = (sourceId: string, value: string) => {
        setData(prev => ({
            ...prev,
            queries: {
                ...prev.queries,
                [sourceId]: value
            }
        }))
    }

    const nextStep = () => setStep(prev => Math.min(prev + 1, 3) as WizardStep)
    const prevStep = () => setStep(prev => Math.max(prev - 1, 1) as WizardStep)

    // -- Render Steps --

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                        id="name"
                        name="name"
                        placeholder="e.g. Immunotherapy for Lung Cancer 2024"
                        value={data.name}
                        onChange={handleInputChange}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="yearStart">Start Year</Label>
                        <Input
                            id="yearStart"
                            name="yearStart"
                            type="number"
                            value={data.yearStart}
                            onChange={handleInputChange}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="yearEnd">End Year</Label>
                        <Input
                            id="yearEnd"
                            name="yearEnd"
                            type="number"
                            value={data.yearEnd}
                            onChange={handleInputChange}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <Label className="text-base">Sources & Queries</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SOURCES_LIST.map(src => {
                        const isChecked = !!data.sources[src.id]
                        return (
                            <Card key={src.id} className={`border-2 transition-colors ${isChecked ? 'border-primary/50 bg-accent/10' : 'border-transparent bg-muted/20'}`}>
                                <CardHeader className="p-4 pb-2 flex flex-row items-center space-y-0 gap-3">
                                    <input
                                        type="checkbox"
                                        id={`src_${src.id}`}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={isChecked}
                                        onChange={() => handleSourceToggle(src.id)}
                                    />
                                    <Label htmlFor={`src_${src.id}`} className="cursor-pointer">{src.label}</Label>
                                </CardHeader>
                                {isChecked && (
                                    <CardContent className="p-4 pt-0">
                                        <Input
                                            placeholder={`Query for ${src.label}...`}
                                            className="mt-2 bg-background"
                                            value={data.queries[src.id] || ''}
                                            onChange={(e) => handleQueryChange(src.id, e.target.value)}
                                        />
                                    </CardContent>
                                )}
                            </Card>
                        )
                    })}
                </div>
            </div>
        </div>
    )

    const renderStep2 = () => (
        <div className="text-center py-10 space-y-4">
            <h3 className="text-xl font-semibold">Scientific Configuration</h3>
            <p className="text-muted-foreground">Prompt and schema configuration coming in next iteration...</p>
        </div>
    )

    const renderStep3 = () => (
        <div className="text-center py-10 space-y-4">
            <h3 className="text-xl font-semibold">Review & Submit</h3>
            <div className="bg-muted p-4 rounded text-left max-w-md mx-auto space-y-2 text-sm">
                <p><strong>Name:</strong> {data.name}</p>
                <p><strong>Range:</strong> {data.yearStart} - {data.yearEnd}</p>
                <p><strong>Sources:</strong> {Object.keys(data.sources).filter(k => data.sources[k]).join(', ')}</p>
            </div>
        </div>
    )

    // -- Submit --
    const handleSubmit = async () => {
        setIsLoading(true)
        try {
            const supabase = createClient()

            const payload = {
                name: data.name,
                // user_id will be handled by RLS/Auth Context usually, or we pass it if we have it
                screening_config: {
                    sources: data.sources,
                    queries: data.queries,
                    yearStart: data.yearStart,
                    yearEnd: data.yearEnd
                },
                status: 'active'
            }

            const { data: proj, error } = await supabase
                .from('infinity.projects') // schema prefix? or handled by client config?
                .insert(payload)
                .select()
                .single()

            if (error) {
                // Retry without prefix if it fails (handling the exposed schema issue dynamically)
                if (error.code === '42P01') {
                    const { error: err2 } = await supabase.from('projects').insert(payload)
                    if (err2) throw err2
                } else {
                    throw error
                }
            }

            router.push('/projects') // Redirect to dashboard
        } catch (error) {
            console.error('Failed to create project:', error)
            alert('Error creating project. Check console.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="container mx-auto py-10 max-w-4xl">
            <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Create New Project</h1>
                <p className="text-muted-foreground">
                    Step {step} of 3: {step === 1 ? 'Screening & Sources' : step === 2 ? 'Scientific Schema' : 'Review'}
                </p>
                {/* Progress Bar */}
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-in-out"
                        style={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>
            </div>

            <Card className="min-h-[400px] flex flex-col">
                <CardContent className="flex-1 pt-6">
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                </CardContent>
                <CardFooter className="flex justify-between border-t bg-muted/20 p-6">
                    <Button
                        variant="outline"
                        onClick={prevStep}
                        disabled={step === 1 || isLoading}
                    >
                        Back
                    </Button>

                    {step < 3 ? (
                        <Button onClick={nextStep} disabled={!data.name}>
                            Next Step
                        </Button>
                    ) : (
                        <Button onClick={handleSubmit} disabled={isLoading}>
                            {isLoading ? 'Creating...' : 'Create Project'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    )
}
