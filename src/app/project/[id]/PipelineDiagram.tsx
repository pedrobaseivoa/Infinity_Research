'use client';

import { FileText, Database, Sparkles, Eye, Layers, Merge, CheckCircle2, Globe, Zap, BookOpen } from 'lucide-react';

export default function PipelineDiagram() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
                <h2 className="text-2xl font-bold mb-2">Infinity Research Pipeline v5.0</h2>
                <p className="text-indigo-100">7-Phase Multi-Model Scientific Article Analysis System</p>
            </div>

            {/* Pipeline Overview */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Pipeline Architecture
                </h3>

                {/* Visual Flow */}
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4 mb-6 overflow-x-auto">
                    {['PDF', 'Vision', 'APIs', 'Consensus', 'Extraction', 'Visual', 'Consolidation', 'JSON'].map((step, i) => (
                        <div key={step} className="flex items-center">
                            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${i === 0 ? 'bg-gray-600 text-white' :
                                    i === 7 ? 'bg-green-600 text-white' :
                                        'bg-indigo-100 text-indigo-700'
                                }`}>
                                {step}
                            </div>
                            {i < 7 && <span className="mx-2 text-gray-400">→</span>}
                        </div>
                    ))}
                </div>

                {/* Phases Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Phase 1 */}
                    <div className="border border-purple-200 rounded-xl p-4 bg-purple-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">Metadata Extraction</h4>
                                <span className="text-xs text-purple-600">GPT-4o</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Multimodal PDF analysis using vision AI to extract text, layout, figures, and metadata.</p>
                        <div className="text-xs text-gray-500 space-y-1">
                            <div className="flex justify-between"><span>Output:</span><span className="text-gray-700">Title, Authors, DOI, Abstract</span></div>
                            <div className="flex justify-between"><span>Cost:</span><span className="text-gray-700">~$0.02-0.05</span></div>
                        </div>
                    </div>

                    {/* Phase 2 */}
                    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">2</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">API Enrichment</h4>
                                <span className="text-xs text-blue-600">11 Academic APIs</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Parallel queries to open-source academic databases for metadata enrichment.</p>
                        <div className="flex flex-wrap gap-1">
                            {['PubMed', 'OpenAlex', 'Crossref', 'Europe PMC', 'Semantic Scholar', 'Unpaywall', 'DOAJ', 'CORE', 'ArXiv', 'DataCite', 'ORCID'].map(api => (
                                <span key={api} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{api}</span>
                            ))}
                        </div>
                    </div>

                    {/* Phase 3 */}
                    <div className="border border-teal-200 rounded-xl p-4 bg-teal-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm">3</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">Consensus Validation</h4>
                                <span className="text-xs text-teal-600">Llama 4 Maverick</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Reconcile Vision + API data into Golden Record with provenance tracking.</p>
                        <div className="text-xs text-gray-500 space-y-1">
                            <div><span className="font-medium">Notation:</span> | = confirm, + = complement</div>
                            <div><span className="font-medium">Output:</span> field_sources for 10 metadata fields</div>
                        </div>
                    </div>

                    {/* Phase 4 */}
                    <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-sm">4</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">Multi-Model Extraction</h4>
                                <span className="text-xs text-orange-600">4 Parallel LLMs</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Four frontier models extract scientific data in parallel for diversity.</p>
                        <div className="flex flex-wrap gap-1">
                            {['Gemini 3 Flash', 'Claude Haiku 4.5', 'GPT-4.1 Mini', 'Grok 4.1 Fast'].map(model => (
                                <span key={model} className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">{model}</span>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">Study type, Sample size, Methods, Results, Bias</div>
                    </div>

                    {/* Phase 5 */}
                    <div className="border border-pink-200 rounded-xl p-4 bg-pink-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-pink-600 text-white flex items-center justify-center font-bold text-sm">5</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">Visual & Tables</h4>
                                <span className="text-xs text-pink-600">Gemini 3.1 Pro</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Extract figures, tables, charts, and visual elements from PDF.</p>
                        <div className="text-xs text-gray-500 space-y-1">
                            <div><span className="font-medium">Figures:</span> Inventory with descriptions</div>
                            <div><span className="font-medium">Tables:</span> Structured data extraction</div>
                        </div>
                    </div>

                    {/* Phase 6 */}
                    <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">6</div>
                            <div>
                                <h4 className="font-semibold text-gray-900">Scientific Consolidation</h4>
                                <span className="text-xs text-indigo-600">DeepSeek v3.2</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Consolidate Phase 4 + Phase 5 into unified scientific record.</p>
                        <div className="text-xs text-gray-500 space-y-1">
                            <div><span className="font-medium">Input:</span> model outputs + visual data</div>
                            <div><span className="font-medium">Output:</span> Complete scientific + visual JSON</div>
                        </div>
                    </div>
                </div>

                {/* Phase 7 - Full Width */}
                <div className="border border-green-200 rounded-xl p-4 bg-green-50 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">7</div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Final Merge</h4>
                            <span className="text-xs text-green-600">No LLM (Programmatic)</span>
                        </div>
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center text-sm">
                        <div className="bg-white rounded-lg p-3">
                            <div className="font-medium text-gray-900">Phase 3</div>
                            <div className="text-xs text-gray-500">Metadata</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 flex items-center justify-center">
                            <span className="text-2xl">+</span>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                            <div className="font-medium text-gray-900">Phase 6</div>
                            <div className="text-xs text-gray-500">Scientific + Visual</div>
                        </div>
                    </div>
                    <div className="text-center mt-3 text-sm text-green-700 font-medium">
                        → Final JSON Output with complete article data
                    </div>
                </div>
            </div>

            {/* APIs Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    Open-Source Academic APIs (11 Sources)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[
                        { name: 'PubMed', desc: 'Biomedical literature', fields: 'PMID, Authors, MeSH' },
                        { name: 'OpenAlex', desc: 'Open scholarly metadata', fields: 'Citations, OA status, Concepts' },
                        { name: 'Crossref', desc: 'DOI registration agency', fields: 'DOI, Publisher, Funder' },
                        { name: 'Europe PMC', desc: 'European life sciences', fields: 'PMC, Full text links' },
                        { name: 'Semantic Scholar', desc: 'AI-powered search', fields: 'Influential citations, Fields' },
                        { name: 'Unpaywall', desc: 'Open access links', fields: 'OA status, PDF URLs' },
                        { name: 'DOAJ', desc: 'Open access journals', fields: 'Journal info, License' },
                        { name: 'CORE', desc: 'Open research papers', fields: 'Full text, Repository' },
                        { name: 'ArXiv', desc: 'Preprint server', fields: 'Preprint versions' },
                        { name: 'DataCite', desc: 'Research data DOIs', fields: 'Datasets, Versions' },
                        { name: 'ORCID', desc: 'Researcher IDs', fields: 'Author identifiers' }
                    ].map(api => (
                        <div key={api.name} className="border border-gray-100 rounded-lg p-3 hover:shadow-md transition-shadow">
                            <div className="font-medium text-gray-900 text-sm">{api.name}</div>
                            <div className="text-xs text-gray-500">{api.desc}</div>
                            <div className="text-xs text-blue-600 mt-1">{api.fields}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Models Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-purple-500" />
                    AI Models Used
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        { name: 'GPT-4o', provider: 'OpenAI', phase: 1, use: 'Metadata extraction (vision)', color: 'purple' },
                        { name: 'Llama 4 Maverick', provider: 'Meta', phase: 3, use: 'Consensus validation', color: 'teal' },
                        { name: 'Gemini 3 Flash', provider: 'Google', phase: 4, use: 'Scientific extraction', color: 'orange' },
                        { name: 'Claude Haiku 4.5', provider: 'Anthropic', phase: 4, use: 'Scientific extraction', color: 'orange' },
                        { name: 'GPT-4.1 Mini', provider: 'OpenAI', phase: 4, use: 'Scientific extraction', color: 'orange' },
                        { name: 'Grok 4.1 Fast', provider: 'xAI', phase: 4, use: 'Scientific extraction', color: 'orange' },
                        { name: 'Gemini 3.1 Pro', provider: 'Google', phase: 5, use: 'Visual & tables extraction', color: 'pink' },
                        { name: 'DeepSeek v3.2', provider: 'DeepSeek', phase: 6, use: 'Scientific consolidation', color: 'indigo' }
                    ].map(model => (
                        <div key={model.name} className={`border rounded-lg p-3 bg-${model.color}-50 border-${model.color}-200`}>
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-gray-900 text-sm">{model.name}</div>
                                <span className={`text-xs px-2 py-0.5 rounded bg-${model.color}-100 text-${model.color}-700`}>Phase {model.phase}</span>
                            </div>
                            <div className="text-xs text-gray-500">{model.provider}</div>
                            <div className="text-xs text-gray-600 mt-1">{model.use}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Output Schema */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-500" />
                    Final Output Schema
                </h3>
                <div className="bg-gray-900 rounded-lg p-4 text-sm font-mono text-gray-100 overflow-x-auto">
                    <pre>{`{
  "phase3_consensus": {
    "title", "authors", "doi", "pmid", "abstract",
    "journal", "year", "field_sources", ...
  },
  "phase6_scientific": {
    "consolidated": { "methodology", "sample_size", "outcomes",
    "main_results", "limitations", "conclusions", ... }
  },
  "confidence_scores": { "methodology": 0.85, ... },
  "_processing": {
    "pipeline_version": "5.0",
    "phases_completed": 7
  }
}`}</pre>
                </div>
            </div>
        </div>
    );
}
