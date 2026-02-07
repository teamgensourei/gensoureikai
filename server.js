import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcrypt";
import pkg from "pg";
import fetch from "node-fetch";

const { Pool } = pkg;
const app = express();

/* =========================
   基本設定
========================= */
app.set("trust proxy", 1); // Render必須
app.use(express.json());
app.use(cors({
  origin: "https://teamgensourei.github.io",
  credentials: true
}));
app.use(session({
  name: "gensourei.sid",
  secret: process.env.SESSION_SECRET || "gensourei-secret",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,        // HTTPS必須（Render）
    sameSite: "none",    // クロスオリジン必須
    maxAge: 1000 * 60 * 60 * 24 // 1日
  }
}));

/* =========================
   DB
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   Scratchホワイトリスト機能
========================= */
const SCRATCH_PROJECT_ID = '1260856560';
let whitelistCache = new Set();
let lastWhitelistUpdate = 0;
const WHITELIST_CACHE_DURATION = 5 * 60 * 1000; // 5分

// Scratchクラウド変数からホワイトリストを取得
async function updateWhitelist() {
  try {
    console.log('📋 Updating whitelist from Scratch cloud variables...');
    
    const response = await fetch(
      `https://clouddata.scratch.mit.edu/logs?projectid=${SCRATCH_PROJECT_ID}&limit=100`
    );
    
    if (!response.ok) {
      console.error('❌ Failed to fetch cloud data:', response.status);
      return;
    }
    
    const logs = await response.json();
    const newWhitelist = new Set();
    
    // ☁ login 変数から許可されたユーザーを抽出
    for (const log of logs) {
      if (log.name === '☁ login' && log.value) {
        const username = decodeCloudValue(log.value);
        if (username) {
          newWhitelist.add(username.toLowerCase());
        }
      }
    }
    
    whitelistCache = newWhitelist;
    lastWhitelistUpdate = Date.now();
    
    console.log(`✅ Whitelist updated: ${whitelistCache.size} users allowed`);
    console.log('Allowed users:', Array.from(whitelistCache));
    
  } catch (error) {
    console.error('❌ Error updating whitelist:', error);
  }
}

// クラウド変数の値をデコード
function decodeCloudValue(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  return null;
}

// ホワイトリストをチェック
async function isUserWhitelisted(username) {
  if (Date.now() - lastWhitelistUpdate > WHITELIST_CACHE_DURATION) {
    await updateWhitelist();
  }
  return whitelistCache.has(username.toLowerCase());
}

// Scratch APIでユーザーが存在するか確認
async function verifyScratchUser(username) {
  try {
    const response = await fetch(`https://api.scratch.mit.edu/users/${username}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      id: data.id,
      username: data.username,
      scratchTeam: data.scratchteam || false
    };
  } catch (error) {
    console.error('Scratch API error:', error);
    return null;
  }
}

// 起動時にホワイトリストを読み込み
updateWhitelist();

// 定期的にホワイトリストを更新（5分ごと）
setInterval(updateWhitelist, WHITELIST_CACHE_DURATION);

/* =========================
   ホワイトリスト確認エンドポイント（デバッグ用）
========================= */
app.get('/api/whitelist', (req, res) => {
  res.json({
    count: whitelistCache.size,
    lastUpdate: new Date(lastWhitelistUpdate).toISOString(),
    users: Array.from(whitelistCache)
  });
});

/* =========================
   Scratch検証エンドポイント（新規）
========================= */
app.post("/api/verify-scratch", async (req, res) => {
  try {
    const { scratchUsername } = req.body;

    if (!scratchUsername) {
      return res.status(400).json({ 
        error: 'Scratchユーザー名を入力してください' 
      });
    }

    // 🔐 ホワイトリストチェック
    const isWhitelisted = await isUserWhitelisted(scratchUsername);
    if (!isWhitelisted) {
      return res.status(403).json({ 
        error: 'このScratchアカウントは登録が許可されていません。管理者に連絡してホワイトリストに追加してもらってください。',
        code: 'NOT_WHITELISTED'
      });
    }

    // Scratchユーザーが存在するか確認
    const scratchUser = await verifyScratchUser(scratchUsername);
    
    if (!scratchUser) {
      return res.status(404).json({ 
        error: 'Scratchユーザーが見つかりません。ユーザー名を確認してください。' 
      });
    }

    // DBで既に登録済みか確認
    const result = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [scratchUsername]
    );

    if (result.rows.length > 0) {
      return res.status(409).json({ 
        error: 'このScratchアカウントは既に登録されています' 
      });
    }

    res.json({
      message: 'Scratchアカウントを確認しました',
      scratchUser: {
        id: scratchUser.id,
        username: scratchUser.username
      },
      verified: true
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

/* =========================
   REGISTER（ホワイトリストチェック追加）
========================= */
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "missing" });
    }

    // 🔐 ホワイトリストチェック（追加）
    const isWhitelisted = await isUserWhitelisted(username);
    if (!isWhitelisted) {
      return res.status(403).json({ 
        error: "このScratchアカウントは登録が許可されていません",
        code: "NOT_WHITELISTED"
      });
    }

    // Scratchユーザーが存在するか確認（追加）
    const scratchUser = await verifyScratchUser(username);
    if (!scratchUser) {
      return res.status(404).json({ 
        error: "Scratchユーザーが見つかりません" 
      });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );

    console.log(`✅ New user registered: ${username}`);
    res.json({ success: true });

  } catch (e) {
    console.error('Registration error:', e);
    res.status(400).json({ error: "user exists" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT id, password_hash FROM users WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return res.json({ success: false });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.json({ success: false });
    }
    req.session.userId = user.id;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

/* =========================
   SESSION CHECK
========================= */
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    userId: req.session.userId
  });
});

/* =========================
   LOGOUT
========================= */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("gensourei.sid", {
      path: "/",
      sameSite: "none",
      secure: true
    });
    res.json({ success: true });
  });
});

/* =========================
   Health Check（拡張）
========================= */
app.get("/health", (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    whitelist: {
      enabled: true,
      allowedUsers: whitelistCache.size,
      lastUpdate: new Date(lastWhitelistUpdate).toISOString()
    }
  });
});

/* =========================
   起動
========================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
  console.log("🌐 Frontend: https://teamgensourei.github.io");
  console.log(`📋 Whitelist: Scratch Project ${SCRATCH_PROJECT_ID}`);
});

/* =========================
   強制DB修復（一次対応・必ず成功する）
========================= */
app.get("/__force_fix_db__", async (req, res) => {
  try {
    // users テーブルが無ければ作る
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      );
    `);
    // password_hash が無ければ追加
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
