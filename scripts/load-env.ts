// Load .env / .env.local for CLI scripts (Next.js loads them itself for the app).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file not present — rely on real environment variables */
  }
}
