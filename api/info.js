import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    // 1. 설정
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });

    try {
        // 2. 숲 방송국 접속 (크롤링)
        const url = `https://bj.afreecatv.com/${id}`;
        // 사람인 척 위장하기 (User-Agent)
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(html);

        // 3. 정보 추출 (메타 태그 활용)
        // 닉네임
        let nickname = $('meta[property="og:title"]').attr('content') || id;
        nickname = nickname.replace(' | 아프리카TV', '').trim();
        
        // 프로필 이미지
        const image = $('meta[property="og:image"]').attr('content');
        
        // 방송 상태 (페이지 내 특정 요소 확인)
        // 'broad_view'라는 단어가 링크에 있거나, 'onair' 클래스가 있으면 방송 중으로 간주
        const isLive = html.includes('javascript:broadview') || $('.onair').length > 0;

        // 4. 결과 전달
        res.status(200).json({
            id,
            name: nickname,
            img: image,
            isLive: isLive
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed', details: error.message });
    }
}
