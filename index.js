require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

// Update the fetch import
import("node-fetch")
  .then(({ default: fetch }) => {
    global.fetch = fetch;
  })
  .catch((err) => console.error("Error loading node-fetch:", err));

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin with service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Cache duration in milliseconds (e.g., 12 hour)
const CACHE_DURATION = 4 * 60 * 60 * 1000;

const API_CONFIGS = {
  cars: {
    url: (year) => `https://api.api-ninjas.com/v1/cars?limit=100&year=${year}`,
    headers: { "X-Api-Key": "BTOsYx47SEw8rRDvct+x+g==SUy2ivypa6z9mOk1" },
  },
  stocks: {
    url: "https://finnhub.io/api/v1/stock/symbol?exchange=US&token=ctp4omhr01qhpppjiev0ctp4omhr01qhpppjievg",
    headers: {
      "Content-Type": "application/json",
    },
  },
  crypto: {
    url: "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100",
  },
  billionaires: {
    url: (year) =>
      `https://forbes400.onrender.com/api/forbes400?limit=100&year=${year}`,
  },
  movies: {
    url: "https://imdb-top-100-movies.p.rapidapi.com/",
    headers: {
      "x-rapidapi-key": "ed98e198d3msha2890b3dde9a12dp1e7caejsnf255bf4ce34c",
      "x-rapidapi-host": "imdb-top-100-movies.p.rapidapi.com",
    },
  },
  news: {
    url: "https://newsdata.io/api/1/news?apikey=pub_63909ffdc676cafdb2b6287a51da5f0e581ff&country=in&language=en",
    headers: {
      "Content-Type": "application/json",
    },
  },
  gnews: {
    url: (query) =>
      `https://gnews.io/api/v4/top-headlines?q=${query || "general"}&apikey=${
        process.env.NEWS_API_KEY
      }`,
    headers: {
      "Content-Type": "application/json",
    },
    processData: (data) => {
      if (!data || !data.articles) {
        console.error("❌ GNews API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.articles.length} GNews items`);
      return data.articles;
    },
  },
  sports: {
    url: `https://www.scorebat.com/video-api/v3/feed/?token=${process.env.MATCH_KEY}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    processData: (data) => {
      console.log(
        "📊 Sports API raw response:",
        JSON.stringify(data).slice(0, 200)
      ); // Log start of response

      if (!data) {
        console.error("❌ Sports API returned null/undefined data");
        return [];
      }

      if (!data.response) {
        console.error("❌ Sports API response missing 'response' field:", data);
        return [];
      }

      const processedData = data.response;
      console.log(`✅ Processed ${processedData.length} sports items`);
      return processedData;
    },
  },
  cricket: {
    url: "https://api.cricapi.com/v1/cricScore",
    headers: {
      "Content-Type": "application/json",
    },
    params: {
      apikey: "0da59eab-0d6c-4950-b0ea-454786bb63e2",
    },
    processData: (data) => {
      if (!data || !data.data) {
        console.error("❌ Cricket API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.data.length} cricket matches`);
      return data.data;
    },
  },
  basketball: {
    url: (date) => `https://v1.basketball.api-sports.io/games?date=${date}`,
    headers: {
      "x-apisports-key": "47f4d4ae2ec97f80df18a074084c523b",
    },
    processData: (data) => {
      if (!data || !data.response) {
        console.error("❌ Basketball API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.response.length} basketball games`);
      return data.response;
    },
  },
  baseball: {
    url: (date) => `https://v1.baseball.api-sports.io/games?date=${date}`,
    headers: {
      "x-apisports-key": "47f4d4ae2ec97f80df18a074084c523b",
    },
    processData: (data) => {
      if (!data || !data.response) {
        console.error("❌ Baseball API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.response.length} baseball games`);
      return data.response;
    },
  },
  hockey: {
    url: (date) => `https://v1.hockey.api-sports.io/games?date=${date}`,
    headers: {
      "x-apisports-key": "47f4d4ae2ec97f80df18a074084c523b",
    },
    processData: (data) => {
      if (!data || !data.response) {
        console.error("❌ Hockey API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.response.length} hockey games`);
      return data.response;
    },
  },
  volleyball: {
    url: (date) => `https://v1.volleyball.api-sports.io/games?date=${date}`,
    headers: {
      "x-apisports-key": "47f4d4ae2ec97f80df18a074084c523b",
    },
    processData: (data) => {
      if (!data || !data.response) {
        console.error("❌ Volleyball API returned invalid data:", data);
        return [];
      }
      console.log(`✅ Processed ${data.response.length} volleyball games`);
      return data.response;
    },
  },
};

async function fetchAndCacheData(apiName, params = {}) {
  try {
    // Create a unique cache key for each sport and date
    const baseDocRef = (() => {
      switch (apiName) {
        case "basketball":
        case "baseball":
        case "hockey":
        case "volleyball":
          return `${apiName}-${
            params.query || new Date().toISOString().split("T")[0]
          }`;
        case "cricket":
          return "cricket-data";
        case "gnews":
          return `gnews-${(params.query || "general").toLowerCase()}`;
        default:
          return `${apiName}-${params.year || ""}`;
      }
    })();

    const metadataRef = db.collection("top100").doc(`${baseDocRef}-metadata`);
    const metadataDoc = await metadataRef.get();
    const now = Date.now();

    // Check cache
    if (metadataDoc.exists) {
      const metadata = metadataDoc.data();
      if (now - metadata.timestamp < CACHE_DURATION) {
        console.log(
          `🚀 [${apiName}] Serving cached data for date:`,
          params.query || "today"
        );

        // Retrieve cached data
        const dataDoc = await db.collection("top100").doc(baseDocRef).get();
        if (dataDoc.exists) {
          return dataDoc.data().items;
        }
      }
    }

    // Fetch fresh data
    console.log(
      `🌐 [${apiName}] Fetching fresh data for date:`,
      params.query || "today"
    );
    const config = API_CONFIGS[apiName];
    const url =
      typeof config.url === "function" ? config.url(params.query) : config.url;

    const response = await fetch(url, {
      headers: config.headers || {},
      ...(config.params && { params: config.params }),
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();
    let processedData = config.processData ? config.processData(data) : data;

    // Special handling for stocks data
    if (apiName === "stocks") {
      processedData = processedData.slice(0, 100);
      if (processedData.length === 0) {
        throw new Error("No stocks data received from API");
      }
    }

    // Cache the processed data
    const batch = db.batch();

    // Save metadata
    batch.set(metadataRef, {
      timestamp: now,
      totalItems: processedData.length || 0,
    });

    // Save actual data
    batch.set(db.collection("top100").doc(baseDocRef), {
      items: processedData,
    });

    await batch.commit();
    console.log(`✅ [${apiName}] Cached ${processedData.length} items`);

    return processedData;
  } catch (error) {
    console.error(`❌ Error in fetchAndCacheData for ${apiName}:`, error);
    throw error;
  }
}

// Update the cleanup function to handle chunked data
// async function cleanupExpiredCache() {
//   try {
//     const snapshot = await db.collection("top100").get();
//     const now = Date.now();
//     const batch = db.batch();

//     for (const doc of snapshot.docs) {
//       const data = doc.data();
//       if (data.timestamp && now - data.timestamp >= CACHE_DURATION) {
//         // If it's a metadata document, also delete its chunks
//         if (doc.id.endsWith("-metadata")) {
//           const baseDocRef = doc.id.replace("-metadata", "");
//           for (let i = 0; i < data.chunks; i++) {
//             const chunkRef = db
//               .collection("top100")
//               .doc(`${baseDocRef}-chunk-${i}`);
//             batch.delete(chunkRef);
//           }
//         }
//         batch.delete(doc.ref);
//       }
//     }

//     await batch.commit();
//   } catch (error) {
//     console.error("Error cleaning up cache:", error);
//   }
// }

async function cleanupStocksChunks() {
  try {
    const snapshot = await db
      .collection("top100")
      .where(admin.firestore.FieldPath.documentId(), ">=", "stocks-chunk-")
      .where(admin.firestore.FieldPath.documentId(), "<", "stocks-chunk-\uf8ff")
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      if (doc.id !== "stocks-chunk-0") {
        batch.delete(doc.ref);
      }
    });

    await batch.commit();
    console.log("Cleaned up extra stocks chunks");
  } catch (error) {
    console.error("Error cleaning up stocks chunks:", error);
  }
}

// Run this once
cleanupStocksChunks();

// API endpoints
app.get("/api/top100/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const { date } = req.query;

    if (!API_CONFIGS[category]) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }

    console.log(
      `🎮 Processing request for ${category}${date ? ` (${date})` : ""}`
    );

    // Handle sports categories
    if (
      ["basketball", "baseball", "hockey", "volleyball", "cricket"].includes(
        category
      )
    ) {
      try {
        const currentDate = date || new Date().toISOString().split("T")[0];
        const data = await fetchAndCacheData(category, { query: currentDate });

        if (!data || data.length === 0) {
          console.log(`⚠️ No ${category} data available for ${currentDate}`);
          return res.json([]);
        }

        console.log(`✅ Returned ${data.length} ${category} items`);
        return res.json(data);
      } catch (error) {
        console.error(`Error fetching ${category} data:`, error);
        return res.status(500).json({
          error: `Failed to fetch ${category} data`,
          details: error.message,
        });
      }
    }

    // Handle other categories
    const data = await fetchAndCacheData(category, { query: date });

    if (!data || data.length === 0) {
      console.log(
        `⚠️ No data returned for ${category}${date ? ` (${date})` : ""}`
      );
      return res.json([]);
    }

    console.log(
      `✅ Successfully returned ${data.length} items for ${category}`
    );
    res.json(data);
  } catch (error) {
    console.error(`❌ Error processing ${req.params.category}:`, error);
    res.status(500).json({
      error: "Failed to fetch data",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
