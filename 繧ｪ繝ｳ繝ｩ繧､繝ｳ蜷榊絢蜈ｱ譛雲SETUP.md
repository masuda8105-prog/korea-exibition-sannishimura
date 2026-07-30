# オンライン名刺共有版 セットアップ

この版は、名刺写真をQRコードへ埋め込まず、**非公開オンラインストレージへ一時保存**します。
QRコードにはランダムな注文トークンだけを入れるため、スタッフが別端末で読み取っても、注文明細と高画質の名刺写真を確認できます。

## 完成後の動き

1. お客様が名刺を撮影します。
2. QR発行時に、次の2ファイルを非公開Storageへ保存します。
   - 撮影した元画像（無加工・最大15MB）
   - 控え表示用の高画質JPEG（長辺最大2400px・品質94%）
3. 注文情報をデータベースへ一時保存します。
4. QRコードには短い注文トークンだけが入ります。
5. スタッフが別端末でQRを読むと、注文明細と名刺画像が表示されます。
6. 「原寸画像を開く」から撮影時の元画像も確認できます。
7. 初期設定では14日後に期限切れになります。

---


> GitHub Pagesの本番Originは `https://masuda8105-prog.github.io` です。
> `/korea-exibition-sannishimura/` はURLのパスなので、`ALLOWED_ORIGINS`には含めません。

## 1. Supabaseプロジェクトを作成

Supabaseで新しいプロジェクトを1つ作成します。

準備するもの：

- Project URL
- Publishable key（`sb_publishable_...`）
- Project Ref

`service_role`キーはHTMLや `online-config.js` へ絶対に書かないでください。
Edge Functionの中だけで使用します。

---

## 2. データベースとStorageを作成

Supabase Dashboardの **SQL Editor** で、次のファイルを実行します。

```text
supabase/sql/01_schema.sql
```

作成されるもの：

- `exhibition_orders` テーブル
- 非公開Storage `business-cards`
- 期限切れ検索用インデックス
- anon / authenticatedユーザーからの直接アクセス禁止

---

## 3. Edge Functionsをデプロイ

Supabase CLIを使用します。

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy exhibition-order --no-verify-jwt
supabase functions deploy cleanup-orders --no-verify-jwt
```

### Function用の環境変数

```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://masuda8105-prog.github.io" \
  ORDER_RETENTION_DAYS="14" \
  SIGNED_URL_SECONDS="3600" \
  BUSINESS_CARD_BUCKET="business-cards" \
  CLEANUP_SECRET="十分に長いランダム文字列"
```

複数の公開元を許可する場合はカンマ区切りです。

```text
https://example.com,https://www.example.com
```

テスト時だけ `ALLOWED_ORIGINS="*"` にできますが、本番では公開ドメインを指定してください。

---

## 4. 注文ツールをHTTPSで公開

このフォルダ全体を、Cloudflare Pages、GitHub Pages、Netlify、自社サーバーなどへ公開します。

重要：

- HTTPSで公開してください。
- QRを読むスタッフ端末からも同じURLを開ける必要があります。
- `product-images` やCSVを含め、フォルダ構成を変えずにアップロードしてください。

---

## 5. online-config.jsを書き換え

`online-config.js` を開いて、次の4項目を設定します。

```js
window.ORDER_ONLINE_CONFIG = Object.freeze({
  enabled: true,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY',
  publicAppUrl: 'https://masuda8105-prog.github.io/korea-exibition-sannishimura/',
  functionName: 'exhibition-order'
});
```

`publicAppUrl` は、スタッフがQRを読んだ時に開く実際の注文ツールURLです。

---

## 6. 期限切れデータの自動削除

`cleanup-orders` は、期限切れの注文情報と名刺ファイルを削除します。

Supabase DashboardのCron機能で、毎日1回 `cleanup-orders` を呼び出してください。
参考SQL：

```text
supabase/sql/02_cleanup_schedule_example.sql
```

SQL内のProject Refと秘密値は必ず書き換えてください。

---

## 動作確認手順

1. スマホで注文ツールを開く
2. 商品を1点カートへ追加
3. 「QR発行へ」を押す
4. 会社名・氏名・電話番号を入力
5. 名刺を撮影
6. 「内容を確認してQR発行」を押す
7. 「アップロード完了」と表示されることを確認
8. 別のスマホでQRを読む
9. 注文明細と名刺写真が表示されることを確認
10. 「原寸画像を開く」で文字を拡大して確認
11. 控えを印刷し、名刺写真が入ることを確認

---

## 個人情報について

名刺写真には個人情報が含まれます。運用時は、お客様に次の案内を表示・掲示してください。

> 注文対応のため、名刺画像とお客様情報を一時的に保存します。保存したデータは注文確認のために使用し、設定した保存期間後に削除します。

韓国語：

> 주문 확인을 위해 명함 이미지와 고객 정보를 일시적으로 저장합니다. 저장된 데이터는 주문 확인 목적으로만 사용하며, 설정된 보관 기간이 지나면 삭제합니다.

---

## オンライン設定前の動作

`enabled: false` のままでも従来の注文・QR機能は動きます。ただし、名刺画像は撮影した端末だけに保存され、スタッフの別端末には表示されません。
