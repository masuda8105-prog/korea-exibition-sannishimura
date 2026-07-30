/*
 * オンライン名刺共有の設定ファイル
 * Supabaseの準備後、3項目を書き換えて enabled を true にしてください。
 */
window.ORDER_ONLINE_CONFIG = Object.freeze({
  enabled: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY',
  publicAppUrl: 'https://YOUR_PUBLIC_DOMAIN/path/index.html',
  functionName: 'exhibition-order'
});
