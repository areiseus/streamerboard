export default async function handler(req, res) {
    try {
        // ✅ [옮기기] 여기! 함수 안으로 이사를 시키십시오.
        // (형님이 설정한 변수명 그대로 넣었습니다)
        const supabase = createClient(
            process.env.streamer_db_URL,
            process.env.streamer_dbkey_anon
        );

        // ... 아래 코드는 건드리지 마세요 ...
        const { data, error } = await supabase
            .from('streamers')
            .select('*')
            .order('is_active', { ascending: false });

        if (error) throw error;
        res.status(200).json(data);

    } catch (error) {
        // 이제 에러가 나면 화면에 범인이 나옵니다!
        res.status(500).json({ error: error.message }); 
    }
}
