/*
 * GitHub Pages 本番公開用設定
 * 公開URL: https://masuda8105-prog.github.io/korea-exibition-sannishimura/
 *
 * Supabase Dashboard の Settings > API Keys から、
 * Project URL と Publishable key を設定してください。
 * Publishable key はブラウザ公開用です。Secret key / service_role は絶対に記載しないでください。
 */
window.ORDER_ONLINE_CONFIG = Object.freeze({
  enabled: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
  publicAppUrl: 'https://masuda8105-prog.github.io/korea-exibition-sannishimura/',
  functionName: 'exhibition-order'
});
