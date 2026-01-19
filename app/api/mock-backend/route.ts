import { NextRequest } from 'next/server';

/**
 * MOCK BACKEND FOR FRONTEND DEVELOPMENT
 * =====================================
 * Returns a realistic cached response without hitting Modal.
 * 
 * Usage: Change your route.ts BACKEND_URL to point to this:
 *   const BACKEND_URL = "http://localhost:3000/api/mock-backend";
 * 
 * Or just rename this file to route.ts and the real one to route.prod.ts
 */

// Simulated delay between tokens (ms) - set to 0 for instant response
const TOKEN_DELAY = 30;

// Cached response data (from a real backend call)
const MOCK_RESPONSE = {
    answer: `Causal inference refers to the process of drawing conclusions about cause-and-effect relationships between variables based on data analysis. Unlike correlation, which simply identifies associations, causal inference attempts to determine whether changes in one variable actually *cause* changes in another.

**Key Concepts:**

1. **Counterfactuals**: What would have happened if the treatment/intervention had been different?
2. **Confounding**: Variables that affect both the treatment and outcome, potentially biasing results.
3. **Randomization**: The gold standard for eliminating confounding through random assignment.

**Common Frameworks:**
- **Rubin Causal Model (Potential Outcomes)**: Focuses on comparing potential outcomes under different treatments.
- **Structural Causal Models (Pearl)**: Uses directed acyclic graphs (DAGs) to represent causal relationships.

In biostatistics, causal inference is crucial for understanding treatment effects, policy interventions, and epidemiological relationships.`,

    sources: [
        {
            text: "Causal inference is the process of determining the independent, actual effect of a particular phenomenon that is a component of a larger system...",
            metadata: {
                title: "Introduction to Causal Inference Methods",
                file_path: "/data/papers/causal_inference_intro.pdf",
                chroma_id: "chunk_001"
            },
            score: 0.92
        },
        {
            text: "The Rubin Causal Model, also known as the potential outcomes framework, defines causal effects by comparing what happens to the same unit...",
            metadata: {
                title: "Potential Outcomes and Causal Effects",
                file_path: "/data/papers/rubin_causal_model.pdf",
                chroma_id: "chunk_002"
            },
            score: 0.87
        },
        {
            text: "Directed acyclic graphs (DAGs) provide a visual representation of causal assumptions and help identify confounding variables...",
            metadata: {
                title: "Graphical Models for Causal Analysis",
                file_path: "/data/papers/pearl_dag_methods.pdf",
                chroma_id: "chunk_003"
            },
            score: 0.84
        },
        {
            text: "Propensity score methods attempt to reduce confounding by balancing observed covariates between treatment groups...",
            metadata: {
                title: "Propensity Score Analysis in Observational Studies",
                file_path: "/data/papers/propensity_scores.pdf",
                chroma_id: "chunk_004"
            },
            score: 0.79
        },
        {
            text: "Instrumental variables provide a method for estimating causal effects when unmeasured confounding is present...",
            metadata: {
                title: "Instrumental Variable Methods",
                file_path: "/data/papers/iv_methods.pdf",
                chroma_id: "chunk_005"
            },
            score: 0.75
        }
    ],

    // Hallucination check results (simulated)
    hallucination: {
        grounding_ratio: 0.9,
        num_claims: 10,
        num_grounded: 9,
        unsupported_claims: [
            "Propensity score methods were first introduced in 1983 by Rosenbaum and Rubin."
        ],
        verifications: [
            { claim: "Causal inference refers to the process of drawing conclusions about cause-and-effect relationships.", is_grounded: true, max_score: 0.95 },
            { claim: "Correlation simply identifies associations.", is_grounded: true, max_score: 0.88 },
            { claim: "Counterfactuals consider what would have happened under different conditions.", is_grounded: true, max_score: 0.91 },
            { claim: "Confounding variables affect both treatment and outcome.", is_grounded: true, max_score: 0.93 },
            { claim: "Randomization is the gold standard for eliminating confounding.", is_grounded: true, max_score: 0.89 },
            { claim: "The Rubin Causal Model focuses on potential outcomes.", is_grounded: true, max_score: 0.94 },
            { claim: "Pearl's framework uses directed acyclic graphs.", is_grounded: true, max_score: 0.92 },
            { claim: "DAGs represent causal relationships visually.", is_grounded: true, max_score: 0.87 },
            { claim: "Causal inference is crucial in biostatistics.", is_grounded: true, max_score: 0.85 },
            { claim: "Propensity score methods were first introduced in 1983.", is_grounded: false, max_score: 0.42 }
        ]
    }
};

// Alternative responses for variety (optional)
const MOCK_RESPONSES: Record<string, typeof MOCK_RESPONSE> = {
    default: MOCK_RESPONSE,
    // Add more cached responses here if you want variety based on keywords
};

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { question, enable_hallucination_check } = body;

    console.log(`[MOCK] Received question: "${question?.slice(0, 50)}..." | HalCheck: ${enable_hallucination_check}`);

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                // 1. Status: Retrieval complete
                await delay(100);
                send({
                    type: "status",
                    stage: "retrieval_complete",
                    papers_found: 5,
                    chunks_reranked: 10
                });

                // 2. Context (sources)
                await delay(50);
                send({
                    type: "context",
                    data: MOCK_RESPONSE.sources
                });

                // 3. Tokens (stream the answer)
                const words = MOCK_RESPONSE.answer.split(/(\s+)/); // Split keeping whitespace
                for (const word of words) {
                    if (word) {
                        send({ type: "token", content: word });
                        if (TOKEN_DELAY > 0) {
                            await delay(TOKEN_DELAY);
                        }
                    }
                }

                // 4. Hallucination check (if enabled)
                if (enable_hallucination_check) {
                    // Simulate hallucination check delay
                    await delay(500);
                    send({
                        type: "hallucination",
                        ...MOCK_RESPONSE.hallucination
                    });
                }

                // 5. Done
                await delay(50);
                send({
                    type: "done",
                    trace_id: `mock_trace_${Date.now()}`,
                    total_duration_ms: 2500
                });

                // End stream
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));

            } catch (err) {
                send({ type: "error", message: String(err) });
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    });
}

// Also support GET for health checks
export async function GET() {
    return Response.json({
        status: "healthy",
        pipeline_ready: true,
        mock: true,
        queue_depth: 0
    });
}