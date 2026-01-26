export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. 선생님이 정한 변수명으로 토큰을 가져옵니다.
    const token = process.env.streamer_board_gihub_token;
    const newData = req.body; // 저장할 데이터

    // Vercel이 자동으로 알려주는 내 저장소 정보
    const owner = process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.VERCEL_GIT_REPO_SLUG;
    const path = 'list.json'; // 수정할 파일 이름

    if (!token) return res.status(500).json({ error: '토큰(streamer_board_gihub_token)이 설정되지 않았습니다.' });
    if (!owner || !repo) return res.status(500).json({ error: '저장소 정보를 찾을 수 없습니다.' });

    try {
        // 2. 기존 파일의 정보(SHA)를 먼저 조회합니다. (덮어쓰기 위해 필수)
        const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        
        const getRes = await fetch(getUrl, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!getRes.ok) throw new Error('기존 list.json을 찾을 수 없습니다.');
        const currentFile = await getRes.json();

        // 3. 파일 내용을 암호화(Base64)해서 GitHub에 덮어씁니다.
        // 한글 깨짐 방지를 위해 Buffer 사용
        const contentEncoded = Buffer.from(JSON.stringify(newData, null, 2), 'utf8').toString('base64');

        const putRes = await fetch(getUrl, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update list.json via Admin Page', // 커밋 메시지
                content: contentEncoded,
                sha: currentFile.sha // "이 버전을 덮어쓴다"는 증명
            })
        });

        if (!putRes.ok) {
            const errData = await putRes.json();
            throw new Error(errData.message);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error("GitHub Save Error:", error);
        res.status(500).json({ error: error.message });
    }
}
