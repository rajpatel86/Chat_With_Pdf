
const API_BASE_URL = 'http://127.0.0.1:5000';


const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const uploadSuccess = document.getElementById('uploadSuccess');
const fileName = document.getElementById('fileName');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const statusIndicator = document.getElementById('statusIndicator');


let isPdfLoaded = false;
let isProcessing = false;


uploadArea.addEventListener('click', () => {
    if (!isPdfLoaded) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isPdfLoaded) {
        uploadArea.classList.add('drag-over');
    }
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    if (!isPdfLoaded) {
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            handleFileUpload(file);
        } else {
            showError('Please upload a valid PDF file');
        }
    }
});

async function handleFileUpload(file) {
    if (file.type !== 'application/pdf') {
        showError('Please upload a PDF file');
        return;
    }

    const maxSize = 10 * 1024 * 1024; 
    if (file.size > maxSize) {
        showError('File size must be less than 10MB');
        return;
    }

    document.querySelector('.upload-placeholder').style.display = 'none';
    uploadProgress.style.display = 'flex';
    uploadSuccess.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/load`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.error || 'Upload failed';
            throw new Error(errorMsg);
        }

        uploadProgress.style.display = 'none';
        uploadSuccess.style.display = 'flex';
        fileName.textContent = file.name;

        isPdfLoaded = true;
        chatInput.disabled = false;
        sendButton.disabled = false;

        updateStatus('PDF Loaded', true);

        const chunks = data.chunks || 'multiple';
        addMessage('bot', `Great! I've loaded "${file.name}" (processed into ${chunks} chunks). You can now ask me questions about it!`);

    } catch (error) {
        console.error('Upload error:', error);
        showError(error.message || 'Failed to upload PDF. Please try again.');

        uploadProgress.style.display = 'none';
        document.querySelector('.upload-placeholder').style.display = 'block';
    }
}


sendButton.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function cleanResponse(text) {
    if (!text) return text;

    let cleaned = text.replace(/RETRIEVED\s+\d+\s+CHUNKS?\s+FROM\s+PDF:\s*/gi, '');

    cleaned = cleaned.replace(/^=+\s*$/gm, '');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    cleaned = cleaned.trim();

    return cleaned;
}

function formatContent(text) {
    if (!text) return '';

    text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    text = text.replace(/\*/g, '');

    let paragraphs = text.split(/\n\n+/);

    paragraphs = paragraphs.map(para => {
        para = para.trim();
        if (!para) return '';

        if (/^\d+\./.test(para)) {
            const lines = para.split('\n');
            const listItems = lines.map(line => {
                line = line.trim();
                if (/^\d+\./.test(line)) {
                    const content = line.replace(/^\d+\.\s*/, '');
                    return `<li>${content}</li>`;
                }
                return line;
            }).join('');
            return `<ol>${listItems}</ol>`;
        }

        if (/^[-•*]/.test(para)) {
            const lines = para.split('\n');
            const listItems = lines.map(line => {
                line = line.trim();
                if (/^[-•*]/.test(line)) {
                    const content = line.replace(/^[-•*]\s*/, '');
                    return `<li>${content}</li>`;
                }
                return line;
            }).join('');
            return `<ul>${listItems}</ul>`;
        }

        para = para.replace(/\n/g, '<br>');
        return `<p>${para}</p>`;
    });

    return paragraphs.join('');
}


async function sendMessage() {
    const question = chatInput.value.trim();

    if (!question || isProcessing) {
        return;
    }

    if (!isPdfLoaded) {
        showError('Please upload a PDF first');
        return;
    }

    addMessage('user', question);

    chatInput.value = '';

    const typingId = showTypingIndicator();

    isProcessing = true;
    chatInput.disabled = true;
    sendButton.disabled = true;
    updateStatus('Thinking...', false);

    try {
        const response = await fetch(`${API_BASE_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });

        const data = await response.json();

        removeTypingIndicator(typingId);

        if (!response.ok) {
            const errorMsg = data.answer || data.error || 'Failed to get response';
            addMessage('bot', `⚠️ ${errorMsg}`);
        } else {
            if (data.answer) {
                const cleanedAnswer = cleanResponse(data.answer);
                addMessage('bot', cleanedAnswer);
            } else {
                addMessage('bot', 'I received an empty response. Please try again.');
            }
        }

    } catch (error) {
        console.error('Chat error:', error);
        removeTypingIndicator(typingId);

        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            addMessage('bot', '⚠️ Cannot connect to the server. Make sure the Flask server is running on http://127.0.0.1:5000');
        } else {
            addMessage('bot', `⚠️ ${error.message || 'Sorry, I encountered an error. Please try again.'}`);
        }
    } finally {
        isProcessing = false;
        chatInput.disabled = false;
        sendButton.disabled = false;
        updateStatus('Ready', true);
        chatInput.focus();
    }
}

function addMessage(type, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    if (type === 'bot') {
        const avatar = document.createElement('div');
        avatar.className = 'bot-avatar';
        avatar.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="url(#gradient3)"/>
                <path d="M12 14C12 13.4477 11.5523 13 11 13C10.4477 13 10 13.4477 10 14C10 14.5523 10.4477 15 11 15C11.5523 15 12 14.5523 12 14Z" fill="white"/>
                <path d="M22 14C22 13.4477 21.5523 13 21 13C20.4477 13 20 13.4477 20 14C20 14.5523 20.4477 15 21 15C21.5523 15 22 14.5523 22 14Z" fill="white"/>
                <path d="M11 19C11 19 13 21 16 21C19 21 21 19 21 19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <defs>
                    <linearGradient id="gradient3" x1="0" y1="0" x2="32" y2="32">
                        <stop offset="0%" stop-color="#667eea"/>
                        <stop offset="100%" stop-color="#764ba2"/>
                    </linearGradient>
                </defs>
            </svg>
        `;
        messageDiv.appendChild(avatar);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const formattedContent = formatContent(content);
    contentDiv.innerHTML = formattedContent;

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'message bot-message';

    const avatar = document.createElement('div');
    avatar.className = 'bot-avatar';
    avatar.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="url(#gradient3)"/>
            <path d="M12 14C12 13.4477 11.5523 13 11 13C10.4477 13 10 13.4477 10 14C10 14.5523 10.4477 15 11 15C11.5523 15 12 14.5523 12 14Z" fill="white"/>
            <path d="M22 14C22 13.4477 21.5523 13 21 13C20.4477 13 20 13.4477 20 14C20 14.5523 20.4477 15 21 15C21.5523 15 22 14.5523 22 14Z" fill="white"/>
            <path d="M11 19C11 19 13 21 16 21C19 21 21 19 21 19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <defs>
                <linearGradient id="gradient3" x1="0" y1="0" x2="32" y2="32">
                    <stop offset="0%" stop-color="#667eea"/>
                    <stop offset="100%" stop-color="#764ba2"/>
                </linearGradient>
            </defs>
        </svg>
    `;

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;

    typingDiv.appendChild(avatar);
    typingDiv.appendChild(indicator);
    chatMessages.appendChild(typingDiv);

    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateStatus(text, isReady) {
    const statusText = statusIndicator.querySelector('.status-text');
    const statusDot = statusIndicator.querySelector('.status-dot');

    statusText.textContent = text;

    if (isReady) {
        statusDot.style.background = '#10b981'; // green
    } else {
        statusDot.style.background = '#f59e0b'; // orange
    }
}

// Show error message
function showError(message) {
    addMessage('bot', `⚠️ ${message}`);
}


console.log('Chat with PDF - Ready!');
console.log('Backend URL:', API_BASE_URL);
