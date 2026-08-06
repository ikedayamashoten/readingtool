// Vercel Serverless Function
// このファイルは「api」フォルダの中に置いてください（api/generate.js）。
// ブラウザ(index.html)からプロンプトを受け取り、サーバー側で Gemini API を呼びます。
// APIキーは環境変数 GEMINI_API_KEY から読み込みます（ブラウザには絶対に出しません）。
// ★ログイン済み（クッキー auth=1）の人だけが使えるよう、入口でチェックします。

function isLoggedIn(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').some(c => c.trim() === 'auth=1');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST でアクセスしてください。' });
    return;
  }

  // ログイン確認
  if (!isLoggedIn(req)) {
    res.status(401).json({ error: 'ログインが必要です。' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY が設定されていません。Vercel の環境変数を確認してください。' });
    return;
  }

  // モデルは環境変数 GEMINI_MODEL で変更できます。未設定なら gemini-2.5-flash。
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const prompt = body && body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt がありません。' });
      return;
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                model + ':generateContent';

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'Gemini API エラー';
      res.status(r.status).json({ error: msg });
      return;
    }

    const parts = data && data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || String(e) });
  }
}
