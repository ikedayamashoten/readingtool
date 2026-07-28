// Vercel Serverless Function
// このファイルは「api」フォルダの中に置いてください（api/login.js）。
// リスニングツールと同じ方式（httpOnlyクッキー auth=1）でログインを管理します。
//
//   POST   … パスワード照合＋GASでメアド確認 → 合格ならクッキー auth=1 を発行
//   GET    … いまログイン中か（クッキーがあるか）を返す
//   DELETE … ログアウト（クッキーを消す）
//
// 必要な環境変数（リスニングと同じ名前）：
//   APP_PASSWORD      … ツール共通のログインパスワード（先生が決める）
//   GAS_URL           … リーディング用GASのウェブアプリURL（.../exec）
//   GAS_SHARED_SECRET … GAS側の SHARED_SECRET と同じ値

function hasAuthCookie(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').some(c => c.trim() === 'auth=1');
}

const COOKIE_SET = 'auth=1; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + (60 * 60 * 24 * 30);
const COOKIE_CLEAR = 'auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export default async function handler(req, res) {
  // いまログイン中かの確認
  if (req.method === 'GET') {
    res.status(200).json({ ok: hasAuthCookie(req) });
    return;
  }

  // ログアウト
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', COOKIE_CLEAR);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST でアクセスしてください。' });
    return;
  }

  const appPassword = process.env.APP_PASSWORD;
  const gasUrl = process.env.GAS_URL;
  const gasSecret = process.env.GAS_SHARED_SECRET;
  if (!appPassword || !gasUrl || !gasSecret) {
    res.status(500).json({ error: 'サーバー設定が未完了です（APP_PASSWORD / GAS_URL / GAS_SHARED_SECRET を確認してください）。' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const schoolCode = String((body && body.schoolCode) || '').trim();
    const email = String((body && body.email) || '').trim().toLowerCase();
    const password = String((body && body.password) || '').trim();

    // 1) 共通パスワードの照合
    if (!password || password !== appPassword) {
      res.status(401).json({ error: 'パスワードが違います。' });
      return;
    }
    if (!schoolCode) {
      res.status(400).json({ error: '学校コードを入力してください。' });
      return;
    }
    if (!email) {
      res.status(400).json({ error: 'メールアドレスを入力してください。' });
      return;
    }

    // 2) GAS で登録メアドを確認（＆ログ記録）
    let gasData;
    try {
      const gasRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: gasSecret, schoolCode: schoolCode, email: email }),
        redirect: 'follow'
      });
      gasData = await gasRes.json();
    } catch (e) {
      res.status(502).json({ error: '認証の確認に失敗しました。時間をおいて再度お試しください。' });
      return;
    }

    if (!gasData || !gasData.ok) {
      if (gasData && gasData.error === 'not_registered') {
        res.status(401).json({ error: 'このメールアドレスは登録されていません。配布元にご確認ください。' });
        return;
      }
      res.status(401).json({ error: '認証を確認できませんでした。' });
      return;
    }

    // 3) クッキーを発行（30日間有効）
    res.setHeader('Set-Cookie', COOKIE_SET);
    res.status(200).json({ ok: true, teacherName: (gasData.teacherName || '') });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || String(e) });
  }
}
