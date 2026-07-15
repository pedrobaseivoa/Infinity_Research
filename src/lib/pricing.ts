// src/lib/pricing.ts

export type ModelPricing = {
    inputCostPer1M: number;
    outputCostPer1M: number;
};

// Pricing Table (USD per 1 Million Tokens)
// Source: OpenRouter / OpenAI Pricing Pages (as of Late 2024)
export const MODEL_PRICES: Record<string, ModelPricing> = {
    // --- Strong Vision Models (Phase 1, 3, 3.5) ---
    'openai/gpt-4o': {
        inputCostPer1M: 2.50,
        outputCostPer1M: 10.00
    },
    'gpt-4o': { // Fallback alias
        inputCostPer1M: 2.50,
        outputCostPer1M: 10.00
    },

    // --- Fast/Cheap Models (Phase 3.5 Scout) ---
    'openai/gpt-4o-mini': {
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60
    },

    // --- Reasoning Models (Phase 2 Consensus) ---
    'deepseek/deepseek-chat': {
        inputCostPer1M: 0.14, // Extremely cheap for V3
        outputCostPer1M: 0.28
    },
};

/**
 * Calculates the total cost in USD for a given model interaction.
 * @param modelName - The model identifier (e.g., 'openai/gpt-4o')
 * @param inputTokens - Number of prompt tokens
 * @param outputTokens - Number of completion tokens
 * @returns Cost in USD (number), rounded to 6 decimals
 */
export function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
    const price = MODEL_PRICES[modelName];

    if (!price) {
        console.warn(`[Pricing] Warning: No pricing found for model '${modelName}'. Returning 0.`);
        return 0;
    }

    const inputCost = (inputTokens / 1_000_000) * price.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * price.outputCostPer1M;

    return Number((inputCost + outputCost).toFixed(6));
}
