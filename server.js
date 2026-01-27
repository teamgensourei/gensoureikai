import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;
const app = express();

/* ===== 基本 ===== */
app.use(express.json());

app.use(cors({
  origin: "https://teamgensourei.github.io",
  credentials: true
}));

/* ===== セッション ===== */
app.use(session({
  name: "gensourei.sid",
  secret: process.env.SESSION_SECRET || "gensourei-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,       // Renderはhttps
    sameSite: "none"
  }
}));

/* ===== DB ===== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===== 疎通確認 ===== */
app.get("/", (req, res) => {
  res.send("Gensourei API running");
});

/* ===== 登録 ===== */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "missing" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "user exists" });
  }
});

/* ===== ログイン ===== */
app.post("/api/login", async (req, res) => {
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
  if (!ok) return res.json({ success: false });

  req.session.userId = user.id;
  res.json({ success: true });
});

/* ===== ログイン確認 ===== */
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, userId: req.session.userId });
});

/* ===== ログアウト ===== */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ===== 起動 ===== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
