// popup.js - 메인 로직
let apiKey = '';
let pageText = '';
let chatHistory = [];

// 간단한 마크다운 렌더러
function parseMarkdown(text) {
  // HTML 이스케이프
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  let html = text;

  // 코드 블록 (```)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 인라인 코드 (`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 제목 (##)
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 굵게 (**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 기울임 (*)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 링크 ([text](url))
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 순서 없는 리스트 (-)
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // 순서 있는 리스트 (1.)
  html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

  // 줄바꿈
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 단락으로 감싸기
  html = `<p>${html}</p>`;

  // 빈 단락 제거
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><br><\/p>/g, '');

  return html;
}

// DOM 요소
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 저장된 API 키 불러오기
  await loadApiKey();

  // 페이지 텍스트 추출
  await extractPageText();

  // 이벤트 리스너 등록
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // API 키 입력 시 전송 버튼 활성화
  apiKeyInput.addEventListener('input', updateSendButtonState);
});

// API 키 불러오기
async function loadApiKey() {
  try {
    const result = await chrome.storage.local.get('openai_api_key');
    if (result.openai_api_key) {
      apiKey = result.openai_api_key;
      apiKeyInput.value = apiKey;
      updateSendButtonState();
    }
  } catch (error) {
    console.error('API 키 불러오기 실패:', error);
  }
}

// API 키 저장
async function saveApiKey() {
  const newApiKey = apiKeyInput.value.trim();

  if (!newApiKey) {
    addAIMessage('API 키를 입력해주세요.');
    return;
  }

  try {
    await chrome.storage.local.set({ openai_api_key: newApiKey });
    apiKey = newApiKey;
    updateSendButtonState();

    saveApiKeyBtn.textContent = '저장됨!';
    setTimeout(() => {
      saveApiKeyBtn.textContent = '저장';
    }, 2000);
  } catch (error) {
    console.error('API 키 저장 실패:', error);
    addAIMessage('API 키 저장에 실패했어요. 다시 시도해주세요.');
  }
}

// 페이지 텍스트 추출
async function extractPageText() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // chrome:// 또는 edge:// 같은 특수 페이지 체크
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      addAIMessage('현재 페이지는 브라우저 내부 페이지라서 내용을 읽을 수 없어요. 일반 웹페이지에서 다시 시도해주세요.');
      return;
    }

    // content script에 메시지 전송
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageText' });

    if (response && response.success) {
      pageText = response.text;
      console.log('페이지 텍스트 추출 완료:', pageText.length, '글자');

      if (!pageText || pageText.length === 0) {
        addAIMessage('이 페이지에서는 요약할 만한 텍스트를 찾지 못했어요. 다른 텍스트가 많은 페이지에서 시도해 보시겠어요?');
      }
    } else {
      throw new Error(response?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('페이지 텍스트 추출 실패:', error);

    // 에러 메시지 상세화
    if (error.message.includes('Receiving end does not exist')) {
      addAIMessage('페이지가 아직 완전히 로드되지 않았어요. 페이지를 새로고침한 후 다시 시도해주세요.');
    } else if (error.message.includes('Cannot access')) {
      addAIMessage('이 페이지는 보안상의 이유로 접근할 수 없어요. 다른 페이지에서 시도해주세요.');
    } else {
      addAIMessage('페이지 내용을 읽어오는 중 문제가 발생했어요. 페이지를 새로고침한 후 다시 시도해주세요.');
    }
  }
}

// 전송 버튼 상태 업데이트
function updateSendButtonState() {
  const hasApiKey = apiKeyInput.value.trim().length > 0;
  sendBtn.disabled = !hasApiKey;
}

// 메시지 전송
async function sendMessage() {
  const userMessage = messageInput.value.trim();

  if (!userMessage) {
    return;
  }

  if (!apiKey) {
    addAIMessage('입력하신 API 키가 유효하지 않은 것 같아요. 상단의 입력창에서 키를 다시 한번 확인해 주시겠어요?');
    return;
  }

  // 사용자 메시지 표시
  addUserMessage(userMessage);

  // 입력창 초기화
  messageInput.value = '';

  // 로딩 인디케이터 표시
  showLoadingIndicator();

  // OpenAI API 호출
  await callOpenAI(userMessage);
}

// 사용자 메시지 추가
function addUserMessage(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = message;

  messageDiv.appendChild(contentDiv);

  // welcome 메시지 제거
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  chatContainer.appendChild(messageDiv);
  scrollToBottom();

  // 채팅 히스토리에 추가
  chatHistory.push({
    role: 'user',
    content: message
  });
}

// AI 메시지 추가
function addAIMessage(message, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = isError ? 'message error' : 'message ai';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Markdown 렌더링
  if (!isError) {
    contentDiv.innerHTML = parseMarkdown(message);
  } else {
    contentDiv.textContent = message;
  }

  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);
  scrollToBottom();

  // 채팅 히스토리에 추가
  if (!isError) {
    chatHistory.push({
      role: 'assistant',
      content: message
    });
  }
}

// 로딩 인디케이터 표시
function showLoadingIndicator() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-indicator';
  loadingDiv.id = 'loadingIndicator';

  const dotsDiv = document.createElement('div');
  dotsDiv.className = 'loading-dots';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'loading-dot';
    dotsDiv.appendChild(dot);
  }

  loadingDiv.appendChild(dotsDiv);
  chatContainer.appendChild(loadingDiv);
  scrollToBottom();
}

// 로딩 인디케이터 제거
function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// 스크롤을 맨 아래로
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// OpenAI API 호출
async function callOpenAI(userMessage) {
  try {
    // 시스템 프롬프트와 페이지 컨텍스트 구성
    const messages = [
      {
        role: 'system',
        content: `당신은 친절한 AI 어시스턴트입니다. 사용자가 현재 보고 있는 웹페이지에 대해 질문하면, 페이지 내용을 바탕으로 정확하고 유용한 답변을 제공하세요. 다음은 현재 페이지의 텍스트 내용입니다:\n\n${pageText.substring(0, 10000)}`
      },
      ...chatHistory,
      {
        role: 'user',
        content: userMessage
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    hideLoadingIndicator();

    if (!response.ok) {
      if (response.status === 401) {
        addAIMessage('입력하신 API 키가 유효하지 않은 것 같아요. 상단의 입력창에서 키를 다시 한번 확인해 주시겠어요?', true);
      } else if (response.status === 429) {
        addAIMessage('요청이 너무 많아요. 잠시 후 다시 시도해주세요.', true);
      } else {
        const errorData = await response.json();
        console.error('API 오류:', errorData);
        addAIMessage('죄송합니다, 지금 네트워크에 연결할 수 없어 답변을 드릴 수 없어요. 잠시 후 다시 시도해 주세요.', true);
      }
      return;
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    addAIMessage(aiResponse);

  } catch (error) {
    console.error('API 호출 실패:', error);
    hideLoadingIndicator();
    addAIMessage('죄송합니다, 지금 네트워크에 연결할 수 없어 답변을 드릴 수 없어요. 잠시 후 다시 시도해 주세요.', true);
  }
}
