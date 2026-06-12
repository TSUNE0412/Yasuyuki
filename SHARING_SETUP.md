# 同僚との共有を有効にする

1. Supabaseで新しいプロジェクトを作成します。
2. SupabaseのAuthentication設定で Anonymous Sign-Ins を有効にします。
3. SQL Editorで `supabase/schema.sql` の内容を実行します。
4. Project SettingsのAPI画面から Project URL と Publishable key を確認します。`service_role` keyは使用しないでください。
5. `config.js` の `supabaseUrl` と `supabaseKey` に値を設定します。
6. このフォルダをVercelへ公開します。Framework Presetは `Other`、Build Commandは空欄、Output Directoryは `.` にします。
7. 公開URLで「招待」を押して共有チームを作成し、表示された招待リンクを同僚へ送ります。

接続情報が空の場合、アプリはこれまでどおり端末内だけに保存されます。
