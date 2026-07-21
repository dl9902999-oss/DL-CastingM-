import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "GOOGLE_AI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image_base64 } = await req.json();
    if (!image_base64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing image_base64 field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Gemini API with vision capability
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

    const prompt = `You are a business card OCR assistant. Analyze this business card image and extract the following information in JSON format:
{
  "company_name": "公司全名",
  "short_name": "公司簡稱（如果能從全名推斷）",
  "contact_name": "聯絡人姓名",
  "contact_title": "職稱",
  "phone": "公司電話（含區碼）",
  "mobile": "手機號碼",
  "fax": "傳真號碼",
  "email": "電子郵件",
  "address": "公司地址",
  "website": "網站"
}

Rules:
- Return ONLY valid JSON, no markdown formatting, no code blocks
- If a field is not found on the card, use empty string ""
- For Taiwanese phone numbers, include area code (e.g., "04-12345678")
- For mobile numbers, format as "0912-345-678" or "0912345678"
- Distinguish between landline (phone) and mobile numbers
- If company name contains "有限公司", "股份有限公司" etc., include it in company_name
- For short_name, extract the core brand name without legal suffix`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: image_base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: `AI API error: ${geminiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiResult = await geminiResponse.json();
    const textContent = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return new Response(
        JSON.stringify({ success: false, error: "No response from AI model" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response - handle potential markdown code blocks
    let cleanedText = textContent.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch {
      console.error("Failed to parse AI response:", cleanedText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure all expected fields exist
    const result = {
      company_name: parsedData.company_name || "",
      short_name: parsedData.short_name || "",
      contact_name: parsedData.contact_name || "",
      contact_title: parsedData.contact_title || "",
      phone: parsedData.phone || "",
      mobile: parsedData.mobile || "",
      fax: parsedData.fax || "",
      email: parsedData.email || "",
      address: parsedData.address || "",
      website: parsedData.website || "",
    };

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});