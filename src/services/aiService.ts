import { GoogleGenAI, Type } from "@google/genai";

export async function extractQuestionsFromFile(base64Data: string, mimeType: string, fileName: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not defined in the environment.");
    throw new Error("Gemini API Key is missing. Please check your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    STRICT INSTRUCTION: Analyze ONLY the attached file named "${fileName}". 
    DO NOT use any external knowledge, do not hallucinate, and do not add any information that is not explicitly present in the file.
    
    Extract the following information from the file:
    1. Assessment Name/Title: Usually found in the "Name of the Training and Description" field in the header table.
    2. Description or Instructions: Any additional context or the training description itself.
    3. Skill Category or Subject: Infer based on the training name (e.g., "Product Management", "Quality Assurance").
    4. Suggested Duration in minutes: Estimate based on the number of questions (e.g., 2 mins per question).
    5. Overall Difficulty (easy, medium, hard): Infer from the content.
    6. All questions with their details (text, type, options, correct answer, marks, section, difficulty).
    
    CRITICAL: For MCQ and Multi-select types, you MUST extract all available options exactly as they appear in the document. Do not summarize or skip any options.
    
    CRITICAL: Identify the Correct Answer by looking for checkmarks (✓), handwritten marks, or bold text next to an option.
    
    Return the result as a structured JSON object. If a piece of information is not in the file, leave it empty or use a reasonable default based ONLY on the file's context.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            instructions: { type: Type.STRING },
            skillCategory: { type: Type.STRING },
            duration: { type: Type.NUMBER },
            difficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["mcq", "true_false", "short_answer", "descriptive", "rating", "multi_select", "file_upload"] },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  marks: { type: Type.NUMBER },
                  section: { type: Type.STRING },
                  difficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] }
                },
                required: ["text", "type", "marks"]
              }
            }
          },
          required: ["name", "questions"]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("AI Question Extraction Error:", error);
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key not valid")) {
      throw new Error("The Gemini API key is invalid. Please check your settings.");
    }
    throw new Error(`Unable to call Gemini API: ${error.message || "Unknown error"}`);
  }
}
