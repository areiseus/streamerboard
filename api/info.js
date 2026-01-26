import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    // 1. 설정 (한글 깨짐 방지 등)
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.query;

    if (!id) return res.status(400).json({ error: 'ID가 필요합니다.' });

    try {
        // 2. 숲 방송국 접속 (크롤링)
        const url = `https://bj.afreecatv.com/${id}`;
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(html);

        // 3. 정보 추출
        // 닉네임 (메타 태그에서 찾기)
        const nickname = $('meta[property="og:title"]').attr('content') || id;
        // 프로필 이미지
        const image = $('meta[property="og:image"]').attr('content');
        // 방송 상태 확인 (페이지에 '방송중' 관련 표시가 있는지 체크)
        // 주의: 숲 페이지 구조에 따라 이 부분은 나중에 디테일 수정이 필요할 수 있습니다.
        const isLive = html.includes('javascript:broadview') || $('.onair').length > 0;

        // 4. 결과 전달
        res.status(200).json({
            id,
            name: nickname.replace(' | 아프리카TV', '').trim(),
            img: image,
            isLive: isLive
        });

    } catch (error) {
        console.error(error);
        // 에러 나면 가짜 데이터라도 보여주기 위해 실패 처리
        res.status(500).json({ error: '데이터 가져오기 실패' });
    }
}
