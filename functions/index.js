/**
 * Prometheus - Firebase Cloud Functions
 * Secure proxy for Gemini AI API requests
 *
 * Authentication: Requires Firebase ID token from authenticated users
 * Using Gen 1 functions with firebase-functions v6+ (v1 compatibility API)
 */

const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
const { CloudBillingClient } = require("@google-cloud/billing");
const axios = require("axios");

// Initialize Firebase Admin
admin.initializeApp();

// Gemini API key from Secret Manager
// Set with: firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Pinterest Client Secret from Secret Manager
// Set with: firebase functions:secrets:set PINTEREST_CLIENT_SECRET
const pinterestClientSecret = defineSecret("PINTEREST_CLIENT_SECRET");

// Pinterest API Configuration
const PINTEREST_CLIENT_ID = "1531950";
const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

// ============================================
// Fashion Analysis Prompt
// ============================================

const FASHION_ANALYSIS_PROMPT = `You are a knowledgeable fashion analyst with expertise in runway history, contemporary streetwear, and aesthetic subcultures. Your analysis should be precise, informed, and tasteful—never overwrought.

Analyze this image and identify the fashion aesthetic. If it matches a known aesthetic (e.g., Quiet Luxury, Acubi, Y2K, Dark Academia, Coastal Grandmother), name it. Otherwise, create a descriptive 2-3 word name.

Respond with ONLY valid JSON:

{
  "aestheticName": "Concise 2-3 word name",
  "summary": "One clear sentence describing what defines this aesthetic and its cultural context.",
  "coreGarments": [
    "Specific item with key detail (e.g., 'Wide-leg wool trousers in charcoal or cream')",
    "Another item with detail (e.g., 'Unstructured linen blazer, relaxed fit')",
    "A third item (e.g., 'Chunky leather loafers or suede mules')"
  ],
  "runwayReferences": [
    {"designer": "Designer Name", "collection": "SS24", "relevance": "Brief connection (e.g., 'pioneered oversized tailoring')"}
  ]
}

Guidelines:
- Be specific, not poetic. Say "relaxed-fit linen trousers" not "effortlessly elegant lower-body draping"
- coreGarments should be shoppable: include fabric, fit, or color when relevant
- Keep summary under 30 words
- 2-3 runway references from real, verifiable collections
- For collection field: ALWAYS use format "SSYY" or "FWYY" (e.g., "SS24", "FW19"). Never use collection names, decade ranges, or apostrophe formats like "'98"`;

// ============================================
// CORS Configuration
// ============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================
// Analyze Image Function (Gen 1 - HTTPS)
// ============================================

exports.analyzeImage = functions
    .runWith({
        maxInstances: 10,
        memory: "256MB",
        timeoutSeconds: 60,
        secrets: [geminiApiKey],
    })
    .https.onRequest(async (req, res) => {
        // Handle CORS
        res.set(corsHeaders);

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        // Only allow POST
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }

        try {
            const { imageData, mimeType } = req.body;

            // Verify Firebase ID token from Authorization header
            const authHeader = req.get('Authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: "Authentication required. Please sign in." });
                return;
            }

            const idToken = authHeader.split('Bearer ')[1];
            console.log("Received token length:", idToken?.length);

            let decodedToken;
            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
                console.log("Token verified for user:", decodedToken.uid);
            } catch (authError) {
                console.error("Token verification failed:", authError.code, authError.message);
                res.status(401).json({
                    error: "Invalid or expired token. Please sign in again.",
                    details: authError.code
                });
                return;
            }

            const uid = decodedToken.uid;
            console.log("Authenticated request from user:", uid);

            if (!imageData || !mimeType) {
                res.status(400).json({ error: "Missing imageData or mimeType" });
                return;
            }

            // Initialize Gemini AI
            const apiKey = geminiApiKey.value();
            if (!apiKey) {
                console.error("GEMINI_API_KEY not configured");
                res.status(500).json({ error: "Server configuration error" });
                return;
            }
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Build the request
            const result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: imageData,
                                },
                            },
                            {
                                text: FASHION_ANALYSIS_PROMPT,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    topK: 20,
                    topP: 0.8,
                    maxOutputTokens: 4096,
                },
            });

            const response = result.response;
            const textContent = response.text();

            if (!textContent) {
                res.status(500).json({ error: "No analysis returned from Gemini" });
                return;
            }

            // Parse the JSON response
            let jsonStr = textContent.trim();
            console.log("Raw Gemini response length:", jsonStr.length);
            console.log("Raw Gemini response (first 300 chars):", jsonStr.substring(0, 300));

            // Remove markdown code blocks using simple string operations
            // Check if it starts with ```json or ```
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.substring(7); // Remove ```json
                console.log("Removed ```json prefix");
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.substring(3); // Remove ```
                console.log("Removed ``` prefix");
            }

            // Check if it ends with ```
            if (jsonStr.trimEnd().endsWith('```')) {
                jsonStr = jsonStr.trimEnd();
                jsonStr = jsonStr.substring(0, jsonStr.length - 3);
                console.log("Removed ``` suffix");
            }

            jsonStr = jsonStr.trim();

            // If still not valid JSON, try to extract from first { to last }
            if (!jsonStr.startsWith('{')) {
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    console.log("Extracted from braces, positions:", firstBrace, lastBrace);
                }
            }

            console.log("JSON to parse (first 300 chars):", jsonStr.substring(0, 300));

            let analysis;
            try {
                analysis = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error("JSON parse error:", parseError.message);
                console.error("Failed JSON string (first 500 chars):", jsonStr.substring(0, 500));
                throw new Error("Failed to parse Gemini response as JSON");
            }

            res.status(200).json({ success: true, data: analysis });
        } catch (error) {
            console.error("Analysis error:", error);
            res.status(500).json({
                error: error.message || "Analysis failed",
            });
        }
    });

// ============================================
// Health Check Function (Gen 1)
// ============================================

exports.healthCheck = functions.https.onRequest((req, res) => {
    res.set(corsHeaders);
    res.status(200).json({ status: "ok", timestamp: Date.now() });
});

// ============================================
// Pinterest OAuth Callback (Gen 1) - iOS-style Bypass
// This function acts as the redirect URI for Pinterest OAuth,
// allowing the extension to work even in trial mode
// ============================================

exports.pinterest_oauth_callback = functions
    .runWith({
        maxInstances: 10,
        memory: "256MB",
        timeoutSeconds: 30,
        secrets: [pinterestClientSecret],
    })
    .https.onRequest(async (req, res) => {
        console.log("Pinterest OAuth callback received");
        console.log("- Query params:", req.query);

        try {
            const { code, state, error, error_description } = req.query;

            // Handle OAuth errors
            if (error) {
                console.error("Pinterest OAuth error:", error, error_description);
                // Redirect back to extension with error
                const extensionRedirect = `https://jkjhkmipcgcfiagfipokfpoefilppfbi.chromiumapp.org/?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}`;
                res.redirect(extensionRedirect);
                return;
            }

            if (!code) {
                console.error("No authorization code received");
                const extensionRedirect = `https://jkjhkmipcgcfiagfipokfpoefilppfbi.chromiumapp.org/?error=no_code`;
                res.redirect(extensionRedirect);
                return;
            }

            console.log("Pinterest OAuth code received, exchanging for token...");
            const secretValue = pinterestClientSecret.value();
            const authString = `${PINTEREST_CLIENT_ID}:${secretValue}`;
            const base64Auth = Buffer.from(authString).toString("base64");

            // The redirect URI must match what was sent to Pinterest
            const callbackRedirectUri = `https://us-central1-prometheus-ext-2026.cloudfunctions.net/pinterest_oauth_callback`;

            // Debug logging for 401 diagnosis
            console.log("Pinterest Token Exchange Debug:");
            console.log("- Client ID:", PINTEREST_CLIENT_ID);
            console.log("- Secret length:", secretValue?.length);
            console.log("- Secret first 4 chars:", secretValue?.substring(0, 4));
            console.log("- Redirect URI:", callbackRedirectUri);
            console.log("- Code length:", code?.length);
            console.log("- Auth string format check:", authString.includes(":") ? "OK" : "MISSING COLON");

            // Exchange code for access token
            const tokenResponse = await axios.post(
                "https://api.pinterest.com/v5/oauth/token",
                new URLSearchParams({
                    grant_type: "authorization_code",
                    code: code,
                    redirect_uri: callbackRedirectUri,
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: `Basic ${base64Auth}`,
                    },
                }
            );

            const { access_token, refresh_token, expires_in, token_type, scope } =
                tokenResponse.data;

            console.log("Pinterest token exchange successful");

            // Redirect back to the Chrome extension with the token data
            // Extension identity redirect URL
            const extensionRedirect = `https://jkjhkmipcgcfiagfipokfpoefilppfbi.chromiumapp.org/?` +
                `access_token=${encodeURIComponent(access_token)}` +
                `&refresh_token=${encodeURIComponent(refresh_token || '')}` +
                `&expires_in=${expires_in}` +
                `&token_type=${encodeURIComponent(token_type)}` +
                `&scope=${encodeURIComponent(scope || '')}` +
                (state ? `&state=${encodeURIComponent(state)}` : '');

            console.log("Redirecting to extension...");
            res.redirect(extensionRedirect);
        } catch (error) {
            console.error("Pinterest callback error:", JSON.stringify(error.response?.data) || error.message);
            console.error("Pinterest error status:", error.response?.status);

            // Redirect to extension with error
            const errorMsg = error.response?.data?.error_description ||
                error.response?.data?.message ||
                error.response?.data?.error ||
                error.message ||
                "Token exchange failed";
            const extensionRedirect = `https://jkjhkmipcgcfiagfipokfpoefilppfbi.chromiumapp.org/?error=${encodeURIComponent(errorMsg)}`;
            res.redirect(extensionRedirect);
        }
    });

// ============================================
// Pinterest OAuth Token Exchange (Gen 1)
// Legacy endpoint for manual token exchange
// ============================================

exports.exchangePinterestToken = functions
    .runWith({
        maxInstances: 10,
        memory: "256MB",
        timeoutSeconds: 30,
        secrets: [pinterestClientSecret],
    })
    .https.onRequest(async (req, res) => {
        res.set(corsHeaders);

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }

        try {
            // Verify Firebase ID token
            const authHeader = req.get("Authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({ error: "Authentication required" });
                return;
            }

            const idToken = authHeader.split("Bearer ")[1];
            try {
                await admin.auth().verifyIdToken(idToken);
            } catch (authError) {
                res.status(401).json({ error: "Invalid or expired token" });
                return;
            }

            const { code, redirectUri } = req.body;

            if (!code || !redirectUri) {
                res.status(400).json({ error: "Missing code or redirectUri" });
                return;
            }

            // Debug logging
            const secretValue = pinterestClientSecret.value();
            console.log("Pinterest OAuth Debug:");
            console.log("- Client ID:", PINTEREST_CLIENT_ID);
            console.log("- Secret length:", secretValue?.length);
            console.log("- Secret first 8 chars:", secretValue?.substring(0, 8));
            console.log("- Redirect URI:", redirectUri);
            console.log("- Code length:", code?.length);

            const authString = `${PINTEREST_CLIENT_ID}:${secretValue}`;
            const base64Auth = Buffer.from(authString).toString("base64");
            console.log("- Auth string format:", `${PINTEREST_CLIENT_ID}:***`);
            console.log("- Base64 length:", base64Auth.length);

            // Exchange code for access token
            const tokenResponse = await axios.post(
                "https://api.pinterest.com/v5/oauth/token",
                new URLSearchParams({
                    grant_type: "authorization_code",
                    code: code,
                    redirect_uri: redirectUri,
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: `Basic ${base64Auth}`,
                    },
                }
            );

            const { access_token, refresh_token, expires_in, token_type, scope } =
                tokenResponse.data;

            res.status(200).json({
                success: true,
                data: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresIn: expires_in,
                    tokenType: token_type,
                    scope: scope,
                },
            });
        } catch (error) {
            console.error("Pinterest token exchange error:", JSON.stringify(error.response?.data) || error.message);
            console.error("Pinterest error status:", error.response?.status);
            const errorMessage = error.response?.data?.error_description ||
                error.response?.data?.message ||
                error.response?.data?.error ||
                error.message ||
                "Failed to exchange token";
            res.status(500).json({
                error: errorMessage,
                details: error.response?.data
            });
        }
    });

// ============================================
// Get Pinterest Boards (Gen 1)
// ============================================

exports.getPinterestBoards = functions
    .runWith({
        maxInstances: 10,
        memory: "256MB",
        timeoutSeconds: 30,
    })
    .https.onRequest(async (req, res) => {
        res.set(corsHeaders);

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }

        try {
            // Verify Firebase ID token
            const authHeader = req.get("Authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({ error: "Authentication required" });
                return;
            }

            const idToken = authHeader.split("Bearer ")[1];
            try {
                await admin.auth().verifyIdToken(idToken);
            } catch (authError) {
                res.status(401).json({ error: "Invalid or expired token" });
                return;
            }

            const { pinterestAccessToken } = req.body;

            if (!pinterestAccessToken) {
                res.status(400).json({ error: "Missing Pinterest access token" });
                return;
            }

            // Fetch boards from Pinterest API
            const boardsResponse = await axios.get(`${PINTEREST_API_BASE}/boards`, {
                headers: {
                    Authorization: `Bearer ${pinterestAccessToken}`,
                },
                params: {
                    page_size: 25,
                },
            });

            const boards = boardsResponse.data.items.map((board) => ({
                id: board.id,
                name: board.name,
                description: board.description,
                pinCount: board.pin_count,
                privacy: board.privacy,
                owner: board.owner,
                media: board.media,
            }));

            res.status(200).json({
                success: true,
                data: {
                    boards: boards,
                    bookmark: boardsResponse.data.bookmark,
                },
            });
        } catch (error) {
            console.error("Pinterest boards error:", error.response?.data || error.message);
            res.status(500).json({
                error: error.response?.data?.message || "Failed to fetch boards",
            });
        }
    });

// ============================================
// Get Pinterest Board Pins (Gen 1)
// ============================================

exports.getPinterestBoardPins = functions
    .runWith({
        maxInstances: 10,
        memory: "256MB",
        timeoutSeconds: 60,
    })
    .https.onRequest(async (req, res) => {
        res.set(corsHeaders);

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }

        try {
            // Verify Firebase ID token
            const authHeader = req.get("Authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({ error: "Authentication required" });
                return;
            }

            const idToken = authHeader.split("Bearer ")[1];
            try {
                await admin.auth().verifyIdToken(idToken);
            } catch (authError) {
                res.status(401).json({ error: "Invalid or expired token" });
                return;
            }

            const { pinterestAccessToken, boardId, bookmark } = req.body;

            if (!pinterestAccessToken || !boardId) {
                res.status(400).json({ error: "Missing Pinterest access token or board ID" });
                return;
            }

            // Fetch pins from the board
            const params = {
                page_size: 50,
            };
            if (bookmark) {
                params.bookmark = bookmark;
            }

            const pinsResponse = await axios.get(
                `${PINTEREST_API_BASE}/boards/${boardId}/pins`,
                {
                    headers: {
                        Authorization: `Bearer ${pinterestAccessToken}`,
                    },
                    params: params,
                }
            );

            const pins = pinsResponse.data.items.map((pin) => ({
                id: pin.id,
                title: pin.title,
                description: pin.description,
                link: pin.link,
                media: pin.media,
                dominantColor: pin.dominant_color,
                createdAt: pin.created_at,
            }));

            res.status(200).json({
                success: true,
                data: {
                    pins: pins,
                    bookmark: pinsResponse.data.bookmark,
                },
            });
        } catch (error) {
            console.error("Pinterest pins error:", error.response?.data || error.message);
            res.status(500).json({
                error: error.response?.data?.message || "Failed to fetch pins",
            });
        }
    });

// ============================================
// Budget Alert - Auto Shutdown Function
// (Based on official Google Cloud documentation)
// ============================================

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "prometheus-ext-2026";
const PROJECT_NAME = `projects/${PROJECT_ID}`;
const billing = new CloudBillingClient();

/**
 * Determine whether billing is enabled for a project
 * @param {string} projectName Name of project to check if billing is enabled
 * @return {bool} Whether project has billing enabled or not
 */
const _isBillingEnabled = async (projectName) => {
    try {
        const [res] = await billing.getProjectBillingInfo({ name: projectName });
        return res.billingEnabled;
    } catch (e) {
        console.log(
            "Unable to determine if billing is enabled on specified project, assuming billing is enabled"
        );
        return true;
    }
};

/**
 * Disable billing for a project by removing its billing account
 * @param {string} projectName Name of project disable billing on
 * @return {string} Text containing response from disabling billing
 */
const _disableBillingForProject = async (projectName) => {
    const [res] = await billing.updateProjectBillingInfo({
        name: projectName,
        resource: { billingAccountName: "" }, // Disable billing
    });
    return `Billing disabled: ${JSON.stringify(res)}`;
};

/**
 * Pub/Sub triggered function that responds to budget alerts
 * When cost exceeds budget, it disables billing for the project
 */
exports.stopBilling = functions
    .runWith({
        memory: "256MB",
        timeoutSeconds: 60,
    })
    .pubsub.topic("budget-alerts")
    .onPublish(async (message) => {
        const pubsubData = message.json;
        console.log("Budget alert received:", JSON.stringify(pubsubData));

        if (pubsubData.costAmount <= pubsubData.budgetAmount) {
            console.log(`No action necessary. (Current cost: ${pubsubData.costAmount})`);
            return `No action necessary. (Current cost: ${pubsubData.costAmount})`;
        }

        console.log(`Cost ${pubsubData.costAmount} exceeds budget ${pubsubData.budgetAmount}. Disabling billing...`);

        const billingEnabled = await _isBillingEnabled(PROJECT_NAME);
        if (billingEnabled) {
            const result = await _disableBillingForProject(PROJECT_NAME);
            console.log(result);
            return result;
        } else {
            console.log("Billing already disabled");
            return "Billing already disabled";
        }
    });
