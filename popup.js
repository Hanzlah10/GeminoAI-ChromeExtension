document.addEventListener('DOMContentLoaded', async function () {
    const errorMessage = document.getElementById('error-message');
    const toggleExtensionBtn = document.getElementById('toggleExtension');
    const extensionContent = document.getElementById('extensionContent');
    const loadingSpinner = document.getElementById('loading-spinner-wrap');
    let aiSession = null;
    let summarizer = null;

    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Retrieve the saved theme from localStorage on page load
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to 'light' if no theme is set
    html.setAttribute('data-theme', savedTheme);
    updateThemeToggleIcon(savedTheme);

    function updateThemeToggleIcon(theme) {
        themeToggle.innerHTML = theme === 'light'
            ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>';
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeToggleIcon(newTheme);
    });

    async function startExtension() {
        if (!self.ai?.languageModel) {
            errorMessage.textContent = "This extension requires Chrome's AI features. Please enable them in chrome://flags/#enable-web-ai";
            errorMessage.style.display = 'block';
            return;
        }
        loadingSpinner.style.display = 'flex';
        errorMessage.style.display = 'none';

        const sessionInitialized = await initAI();
        loadingSpinner.style.display = 'none';
        if (sessionInitialized) {
            extensionContent.style.display = 'block';
            toggleExtensionBtn.querySelector('.toggle-text').textContent = 'ON';
            toggleExtensionBtn.classList.add('active');
            updateExtensionState(true);
        } else {
            errorMessage.textContent = 'Failed to initialize AI session. Please try again.';
            errorMessage.style.display = 'block';
        }
    }

    async function stopExtension() {
        if (aiSession) {
            aiSession.destroy();
            aiSession = null;
        }
        if (summarizer) {
            summarizer.destroy();
            summarizer = null;
        }
        extensionContent.style.display = 'none';
        toggleExtensionBtn.querySelector('.toggle-text').textContent = 'OFF';
        toggleExtensionBtn.classList.remove('active');
        updateExtensionState(false);
    }

    toggleExtensionBtn.addEventListener('click', async () => {
        const isActive = await getExtensionState();
        if (isActive) {
            await stopExtension();
        } else {
            await startExtension();
        }
    });

    async function initAI() {
        try {
            aiSession = await self.ai.languageModel.create({
                temperature: 0.7,
                topK: 3,
                systemPrompt: "You are my personal assistant. Help me stay organized, productive, and informed by providing concise, actionable insights."
            });
            return true;
        } catch (error) {
            console.error('AI initialization error:', error);
            return false;
        }
    }

    async function updateExtensionState(state) {
        chrome.runtime.sendMessage({ type: 'UPDATE_STATE', payload: state });
    }

    async function getExtensionState() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
                resolve(response?.state || false);
            });
        });
    }

    // On popup load, check the current state
    const isActive = await getExtensionState();
    if (isActive) {
        await startExtension();
    } else {
        await stopExtension();
    }

    // Tab switching logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const tabName = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });

            btn.classList.add('active');
            const activeContent = document.getElementById(tabName);
            activeContent.classList.add('active');
            activeContent.style.display = 'block';

            if (tabName === 'summarize') {
                await createSummarizer();
            }
            if (tabName === 'translate') {
                populateLanguageDropdowns();
            }
        });
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        if (!content.classList.contains('active')) {
            content.style.display = 'none';
        }
    });


    // Function to create and manage the summarizer
    async function createSummarizer() {
        try {
            const canSummarize = await ai.summarizer.capabilities();
            if (canSummarize && canSummarize.available !== 'no') {
                if (canSummarize.available === 'readily') {
                    summarizer = await ai.summarizer.create();
                } else {
                    summarizer = await ai.summarizer.create();
                    summarizer.addEventListener('downloadprogress', (e) => {
                        console.log(`Download progress: ${e.loaded} of ${e.total}`);
                    });
                    await summarizer.ready;
                }
                return true;
            } else {
                console.warn("Summarizer capabilities unavailable.");
                errorMessage.textContent = 'Summarization not supported on this device.';
                errorMessage.style.display = 'block';
                return false;
            }
        } catch (error) {
            console.error('Error creating summarizer:', error);
            errorMessage.textContent = 'Failed to initialize summarizer. Some features may be unavailable.';
            errorMessage.style.display = 'block';
            return false;
        }
    }


    // Function to convert markup to plain text
    function convertMarkdownToHTML(text) {
        if (!text) return "";

        const codeBlocks = [];
        let codeBlockCounter = 0;

        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const placeholder = `___CODE_BLOCK_${codeBlockCounter}___`;
            codeBlocks.push({
                code: code.trim(),
                language: language || ''
            });
            codeBlockCounter++;
            return placeholder;
        });

        const patterns = {
            heading: /^(#{1,6})\s+(.*)$/gm,
            bold: /\*\*(.*?)\*\*/g,
            italic: /\*(.*?)\*/g,
            listItem: /^(\s*)([-*]|\d+\.)\s+(.*)$/gm,
            link: /\[(.*?)\]\((.*?)\)/g,
            image: /!\[(.*?)\]\((.*?)\)/g,
            horizontalRule: /^---+$/gm,
            inlineCode: /`([^`]+)`/g
        };

        text = text
            .replace(patterns.bold, '<strong>$1</strong>')
            .replace(patterns.italic, '<em>$1</em>')
            .replace(patterns.link, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(patterns.image, '<img src="$2" alt="$1" />')
            .replace(patterns.horizontalRule, '<hr>')
            .replace(patterns.inlineCode, '<code>$1</code>');

        text = text.replace(patterns.heading, (match, hashes, content) => {
            if (match.includes('___CODE_BLOCK_')) return match;
            const level = hashes.length;
            return `<h${level}>${content}</h${level}>`;
        });

        let currentLevel = 0;
        let listStack = [];

        text = text.replace(patterns.listItem, (match, indent, marker, content) => {
            const level = indent.length / 2;
            const isOrdered = /\d+\./.test(marker);
            const listType = isOrdered ? 'ol' : 'ul';

            let html = '';

            while (currentLevel > level) {
                html += `</${listStack.pop()}>`;
                currentLevel--;
            }

            // Open new lists if we're going deeper
            while (currentLevel < level) {
                html += `<${listType}>`;
                listStack.push(listType);
                currentLevel++;
            }

            return html + `<li>${content}</li>`;
        });

        while (listStack.length > 0) {
            text += `</${listStack.pop()}>`;
        }

        text = text.replace(/___CODE_BLOCK_(\d+)___/g, (match, index) => {
            const block = codeBlocks[parseInt(index)];
            const language = block.language ? ` class="language-${block.language}"` : '';
            const escapedCode = block.code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `<pre><code${language}>${escapedCode}</code></pre>`;
        });

        text = text.replace(/\n(?!<\/?(ul|ol|li|h\d|pre|code|hr|a|img))/g, '<br>');

        return text;
    }


    // Summarize tab logic
    const summarizeBtn = document.getElementById('summarizeBtn');
    const summaryResult = document.getElementById('summaryResult');

    async function summarizeText(text) {
        if (!summarizer) {
            console.warn("Summarizer is not initialized.");
            summaryResult.innerText = "Summarization not supported on this device.";
            return null;
        }

        try {
            const result = await summarizer.summarize(text);
            return result;
        } catch (error) {
            console.log('Summarization error:', error);
            summaryResult.innerText = 'Failed to summarize the page. Please try again.';
            return null;
        }
    }


    summarizeBtn.addEventListener('click', async () => {
        if (!aiSession && !(await initAI())) return;

        summaryResult.innerHTML = `
            <div class="loading-container">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            chrome.scripting.executeScript(
                {
                    target: { tabId: tab.id },
                    function: () => {
                        return document.documentElement.innerText || document.documentElement.outerText || document.body.textContent;
                    }
                },
                async (result) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                        summaryResult.innerText = 'Failed to retrieve page content. Permission might be restricted.';
                        return;
                    }

                    const pageText = result[0]?.result;
                    if (!pageText) {
                        summaryResult.innerText = "Content access restricted on this page.";
                        return;
                    }

                    const summary = await summarizeText(pageText);
                    if (summary) {
                        summaryResult.innerHTML = `
                            <div class="summary-content">
                                <div class="message-content">${convertMarkdownToHTML(summary)}</div>
                            </div>
                        `;

                        const summaryContentEl = summaryResult.querySelector('.summary-content');
                        addCopyButton(summaryContentEl);
                    } else {
                        summaryResult.innerText = 'Could not generate summary. Please try again.';
                    }
                }
            );
        } catch (error) {
            console.error('Error generating summary:', error);
            summaryResult.innerText = 'An error occurred. Please try another page or refresh.';
        }
    });


    // Simplify tab logic
    const simplifyBtn = document.getElementById('simplifyBtn');
    const textToSimplify = document.getElementById('textToSimplify');
    const simplificationLevel = document.getElementById('simplificationLevel');
    const simplificationLength = document.getElementById('simplificationLength');
    const simplifyResult = document.getElementById('simplifyResult');

    let rewriter;
    const level = simplificationLevel.value;
    const length = simplificationLength.value;

    const createRewriter = async () => {
        rewriter = await self.ai.rewriter.create({
            tone: level,
            length: length,
            format: 'as-is',
            sharedContext: 'I dont understand complex things i want response in easy and simple format'
        });
    };

    if (level == '' || length == '') {
        simplifyResult.innerText = 'Please select simplification level and length.';
    }
    else {


        simplifyBtn.addEventListener('click', async () => {
            if (!aiSession && !(await initAI())) return;

            const text = textToSimplify.value.trim();
            if (!text) return;

            simplifyResult.innerHTML = `
        <div class="loading-container">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

            try {
                await createRewriter();

                const stream = await rewriter.rewriteStreaming(text);
                let response = '';

                for await (const chunk of stream) {
                    response = chunk.trim();
                    simplifyResult.innerHTML = response;
                }

            } catch (error) {
                console.error('Error simplifying text:', error);
                simplifyResult.innerText = 'Failed to simplify the text. Please try again.';
            }
        });

    }






    // Translate Logic
    const supportedLanguages = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ar', name: 'Arabic' },
        { code: 'bn', name: 'Bengali' },
        { code: 'de', name: 'German' },
        { code: 'fr', name: 'French' },
        { code: 'hi', name: 'Hindi' },
        { code: 'it', name: 'Italian' },
        { code: 'ko', name: 'Korean' },
        { code: 'nl', name: 'Dutch' },
        { code: 'pl', name: 'Polish' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'ru', name: 'Russian' },
        { code: 'th', name: 'Thai' },
        { code: 'tr', name: 'Turkish' },
        { code: 'vi', name: 'Vietnamese' },
        { code: 'zh', name: 'Chinese (Simplified)' },
        { code: 'zh-Hant', name: 'Chinese (Traditional)' },
    ];

    const elements = {
        sourceText: document.getElementById('userInputText'),
        sourceLanguage: document.getElementById('sourceLanguageDropdown'),
        targetLanguage: document.getElementById('targetLanguageDropdown'),
        translationResult: document.getElementById('translationResult'),
        translateBtn: document.getElementById('translateBtn'),
        swapBtn: document.getElementById('swapLanguages'),
        copyBtn: document.getElementById('copyTranslation'),
        speakSourceBtn: document.getElementById('speakSource'),
        speakTargetBtn: document.getElementById('speakTarget'),
        errorAlert: document.getElementById('errorAlert'),
        charCounter: document.getElementById('charCount'),
    };

    elements.translateBtn.addEventListener('click', translateText);
    elements.swapBtn.addEventListener('click', swapLanguages);
    elements.copyBtn.addEventListener('click', copyTranslation);
    elements.speakSourceBtn.addEventListener('click', () => speakText('source'));
    elements.speakTargetBtn.addEventListener('click', () => speakText('target'));
    elements.sourceText.addEventListener('input', updateCharacterCount);

    function showError(message, duration = 5000) {
        const errorAlert = elements.errorAlert;
        errorAlert.querySelector('.error-message').textContent = message;
        errorAlert.style.display = 'flex';
        setTimeout(() => {
            errorAlert.style.display = 'none';
        }, duration);
    }

    function updateCharacterCount() {
        const count = elements.sourceText.value.length;
        elements.charCounter.textContent = count;
        if (count >= 4900) {
            elements.charCounter.classList.add('near-limit');
        } else {
            elements.charCounter.classList.remove('near-limit');
        }
    }

    function populateLanguageDropdowns() {
        const populateDropdown = (dropdown, defaultLang) => {
            dropdown.innerHTML = '';
            supportedLanguages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang.code;
                option.textContent = lang.name;
                if (lang.code === defaultLang) option.selected = true;
                dropdown.appendChild(option);
            });
        };

        populateDropdown(elements.sourceLanguage, 'en');
        populateDropdown(elements.targetLanguage, 'es');
    }

    async function translateText() {
        const text = elements.sourceText.value.trim();
        if (!text) {
            showError('Please enter text to translate.');
            return;
        }

        if (!self.translation) {
            showError('Translation API not available. Please enable it in chrome://flags.');
            return;
        }

        try {
            elements.translateBtn.disabled = true;
            elements.translationResult.classList.add('loading');

            const languagePair = {
                sourceLanguage: elements.sourceLanguage.value,
                targetLanguage: elements.targetLanguage.value
            };

            const canTranslate = await translation.canTranslate(languagePair);

            if (canTranslate === 'readily') {
                const translator = await translation.createTranslator(languagePair);
                const translatedText = await translator.translate(text);
                elements.translationResult.textContent = translatedText;
                elements.translationResult.classList.remove('placeholder');
                elements.copyBtn.style.display = 'inline-block';
            } else {
                showError('Translation is not available for the selected languages.');
            }
        } catch (error) {
            showError(`Translation error: ${error.message}`);
        } finally {
            elements.translateBtn.disabled = false;
            elements.translationResult.classList.remove('loading');
        }
    }

    function swapLanguages() {
        const sourceVal = elements.sourceLanguage.value;
        const targetVal = elements.targetLanguage.value;
        const sourceText = elements.sourceText.value;
        const targetText = elements.translationResult.textContent;

        elements.sourceLanguage.value = targetVal;
        elements.targetLanguage.value = sourceVal;
        elements.sourceText.value = targetText;
        elements.translationResult.textContent = sourceText;
        updateCharacterCount();
    }

    async function copyTranslation() {
        const text = elements.translationResult.textContent;
        if (text && !text.includes('Translation will appear here')) {
            try {
                await navigator.clipboard.writeText(text);
                elements.copyBtn.classList.add('copied');
                setTimeout(() => elements.copyBtn.classList.remove('copied'), 2000);
            } catch (error) {
                showError('Failed to copy text to clipboard');
            }
        }
    }

    function speakText(type) {
        const text = type === 'source' ? elements.sourceText.value : elements.translationResult.textContent;
        const lang = type === 'source' ? elements.sourceLanguage.value : elements.targetLanguage.value;

        if (text && !text.includes('Translation will appear here')) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            speechSynthesis.speak(utterance);
        }
    }

    //Chat Functionality
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');

    let abortController = null;

    function createCopyButton() {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyButton.setAttribute('title', 'Copy to clipboard');
        return copyButton;
    }


    async function handleChatInput() {
        const question = chatInput.value.trim();
        if (!question) return;

        chatInput.value = '';
        appendMessage('user', question);

        if (!aiSession && !(await initAI())) {
            sendChatBtn.disabled = false;
            return;
        }

        sendChatBtn.textContent = 'Stop';
        sendChatBtn.onclick = stopResponse;

        try {
            await generateChatResponse(question);
        } catch (error) {
            console.error('Error generating response:', error);
            appendMessage('alert', 'Failed to get response. Please try again.');
        } finally {
            resetSendButton();
            chatInput.focus();
        }
    }

    function stopResponse() {
        if (abortController) {
            abortController.abort();
            appendMessage('alert', 'Response generation stopped.');
        }
        resetSendButton();
    }

    function resetSendButton() {
        sendChatBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `;
        sendChatBtn.onclick = handleChatInput;
        sendChatBtn.disabled = false;
        abortController = null;
    }

    async function generateChatResponse(userMessage) {
        const prompt = userMessage;
        let response = '';
        const messageEl = appendMessage('robot', 'Generating...');

        abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const stream = await aiSession.promptStreaming(prompt, { signal });

            for await (const chunk of stream) {
                response = chunk;
                updateMessageContent(messageEl, convertMarkdownToHTML(response));
            }
            addCopyButton(messageEl);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request was aborted');
            } else {
                console.error('Error during stream:', error);
                appendMessage('alert', 'An error occurred while generating the response.');
            }
        } finally {
            abortController = null;
        }

        return response.trim();
    }
    function addCopyButton(messageEl) {
        const copyButton = createCopyButton();

        copyButton.addEventListener('click', async () => {
            try {
                const textToCopy = messageEl.querySelector('.message-content').textContent;
                await navigator.clipboard.writeText(textToCopy);

                copyButton.classList.add('copied');
                copyButton.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                `;

                setTimeout(() => {
                    copyButton.classList.remove('copied');
                    copyButton.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    `;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });

        messageEl.appendChild(copyButton);
    }


    function appendMessage(role, msg) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${role}`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        if (role === 'robot' && msg === 'Generating...') {
            messageContent.innerHTML = `
            <div class="loading-container">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        }
        else if (role === 'alert') {
            messageContent.innerHTML = `<div class ="msg-error-alert" >Alert: ${msg} </div> `;
        }
        else {
            messageContent.innerHTML = msg;
        }

        messageEl.appendChild(messageContent);
        chatMessages.style.display = 'block';
        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageEl;
    }

    function updateMessageContent(messageEl, msg) {
        const messageContent = messageEl.querySelector('.message-content');
        messageContent.innerHTML = msg;
    }

    sendChatBtn.addEventListener('click', handleChatInput);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatInput();
    });
});

