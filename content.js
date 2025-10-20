// content.js - 웹 페이지에서 텍스트 추출
console.log('Browser Helper: Content script loaded');

/**
 * 페이지에서 단순 텍스트만 추출하는 함수
 * script, style, noscript 태그는 제외
 */
function extractPageText() {
  // 제외할 태그들
  const excludedTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG'];

  // body 태그의 텍스트를 재귀적으로 추출
  function getTextFromNode(node) {
    let text = '';

    // 텍스트 노드인 경우
    if (node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent.trim();
      if (content) {
        text += content + ' ';
      }
    }
    // 요소 노드인 경우
    else if (node.nodeType === Node.ELEMENT_NODE) {
      // 제외할 태그가 아닌 경우에만 처리
      if (!excludedTags.includes(node.tagName)) {
        // 자식 노드들을 순회
        for (const child of node.childNodes) {
          text += getTextFromNode(child);
        }
      }
    }

    return text;
  }

  // body에서 텍스트 추출
  const bodyText = getTextFromNode(document.body);

  // 연속된 공백을 하나로 줄이고, 앞뒤 공백 제거
  const cleanedText = bodyText.replace(/\s+/g, ' ').trim();

  // 디버깅: 추출된 텍스트 로그
  console.log('=== 페이지 텍스트 추출 완료 ===');
  console.log('페이지 URL:', window.location.href);
  console.log('페이지 제목:', document.title);
  console.log('추출된 텍스트 길이:', cleanedText.length, '글자');
  console.log('추출된 전체 텍스트:', cleanedText);
  console.log('===============================');

  return cleanedText;
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageText') {
    try {
      const pageText = extractPageText();
      sendResponse({
        success: true,
        text: pageText,
        url: window.location.href,
        title: document.title
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
    return true; // 비동기 응답을 위해 true 반환
  }
});
