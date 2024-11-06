document.addEventListener('DOMContentLoaded', async function () {
    const errorMessage = document.getElementById('error-message');

    // Check if AI API is available
    if (!self.ai?.languageModel) {
        errorMessage.textContent = "This extension requires Chrome's AI features. Please enable them in chrome://flags/#enable-web-ai";
        errorMessage.style.display = 'block';
        return;
    }

    let aiSession = null;
    let summarizer = null;

    // Initialize AI session
    async function initAI() {
        try {
            aiSession = await self.ai.languageModel.create({
                temperature: 1,
                topK: 4,
                systemPrompt: "Pretend to be a Tutor"
            });
            return true;
        } catch (error) {
            console.error('AI initialization error:', error);
            errorMessage.textContent = 'Failed to initialize AI features. Please try again.';
            errorMessage.style.display = 'block';
            return false;
        }
    }

    // Initialize AI session
    await initAI();

    // Function to convert markup to plain text with styling
    function convertMarkdownToHTML(text) {
        const headingRegex = /^(#{1,6})\s+(.*)$/gm;
        const boldRegex = /\*\*(.*?)\*\*/g;
        const italicRegex = /\*(.*?)\*/g;
        const codeBlockRegex = /```([\s\S]*?)```/g;
        const listRegex = /^(\d+\.|[-*])\s+(.*)/gm;
        const linkRegex = /\[(.*?)\]\((.*?)\)/g;
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
        const horizontalRuleRegex = /^---+$/gm;

        function handleListItem(match, marker, content) {
            const isOrdered = marker.endsWith('.');
            const tag = isOrdered ? 'ol' : 'ul';
            const item = `<li>${content}</li>`;
            return `<${tag}>${item}</${tag}>`;
        }

        text = text.replace(headingRegex, (match, hashes, content) => {
            const level = hashes.length;
            return `<h${level}>${content}</h${level}>`;
        });

        text = text.replace(boldRegex, '<strong>$1</strong>');
        text = text.replace(italicRegex, '<em>$1</em>');
        text = text.replace(codeBlockRegex, (match, code) => {
            const formattedCode = code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code>${formattedCode}</code></pre>`;
        });
        text = text.replace(listRegex, handleListItem);
        text = text.replace(linkRegex, '<a href="$2" target="_blank">$1</a>');
        text = text.replace(imageRegex, '<img src="$2" alt="$1" />');
        text = text.replace(horizontalRuleRegex, '<hr>');
        text = text.replace(/\n/g, '<br>');

        return text;
    }

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
            return false;
        }
    }

    // Initialize summarizer before use
    await createSummarizer();

    // Tab switching logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });

    // Summarize tab logic
    const summarizeBtn = document.getElementById('summarizeBtn');
    const summaryResult = document.getElementById('summaryResult');

    async function summarizeText(text) {
        try {
            const result = await summarizer.summarize(text);
            console.log('Summary result:', result);
            return result;
        } catch (error) {
            console.error('Summarization error:', error);
            summaryResult.innerText = 'Failed to summarize the page. Please try another page or refresh.';
        } finally {
            // Destroy summarizer to release resources after each use
            if (summarizer) summarizer.destroy();
            await createSummarizer(); // Re-create summarizer for next usage
        }
    }

    summarizeBtn.addEventListener('click', async () => {
        if (!aiSession && !(await initAI())) return;
        summaryResult.innerText = 'Summarizing...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const tabText = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText,
            });

            if (!tabText || !tabText[0].result) {
                throw new Error("Could not retrieve page content");
            }

            const pageText = tabText[0].result;
            const summary = await summarizeText(pageText);
            summaryResult.innerText = convertMarkdownToHTML(summary);
        } catch (error) {
            console.error('Error generating summary:', error);
            summaryResult.innerText = 'Failed to summarize the page. Please try another page or refresh.';
        }
    });

    // Simplify tab logic
    const simplifyBtn = document.getElementById('simplifyBtn');
    const textToSimplify = document.getElementById('textToSimplify');
    const simplificationLevel = document.getElementById('simplificationLevel');
    const simplifyResult = document.getElementById('simplifyResult');

    simplifyBtn.addEventListener('click', async () => {
        if (!aiSession && !(await initAI())) return;
        const text = textToSimplify.value.trim();
        if (!text) return;

        simplifyResult.innerText = 'Simplifying...';
        const level = simplificationLevel.value;
        const prompt = `${level === 'basic' ? 'Simplify in very basic language ' : 'Explain technically in very technical and professional language'} ,the given text:\n\n${text}`;

        try {
            const stream = await aiSession.promptStreaming(prompt);
            let response = ''; // Initialize response variable

            for await (const chunk of stream) {
                response = chunk.trim();
                simplifyResult.innerText = convertMarkdownToHTML(response);
            }
        } catch (error) {
            console.error('Error simplifying text:', error);
            simplifyResult.innerText = 'Failed to simplify text.';
        }
    });


    // Quiz tab logic
    const generateQuizBtn = document.getElementById('generateQuizBtn');
    const quizType = document.getElementById('quizType');
    const quizArea = document.getElementById('quizArea');



    generateQuizBtn.addEventListener('click', async () => {
        if (!aiSession && !(await initAI())) return;
        quizArea.innerText = 'Generating quiz...';

        const quizTypeSelected = quizType.value;
        const prompt = `Generate a ${quizTypeSelected === 'multiChoice' ? 'multiple-choice' : quizTypeSelected === 'fillBlank' ? 'fill-in-the-blank' : 'true/false'} quiz.`;

        try {
            const stream = await aiSession.promptStreaming(prompt);
            let response = '';

            for await (const chunk of stream) {
                response = chunk.trim();


                const formattedQuizResponse = convertMarkdownToHTML(response);
                quizArea.innerHTML = formattedQuizResponse;
            }
        } catch (error) {
            console.error('Error generating quiz:', error);
            quizArea.innerText = 'Failed to generate quiz.';
        }
    });















    //Chat Functionality

    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');

    let abortController = null;  // To manage aborting the API request

    async function handleChatInput() {
        const question = chatInput.value.trim();
        if (!question) return;

        // Clear the input
        chatInput.value = '';
        appendMessage('user', question);

        if (!aiSession && !(await initAI())) {
            sendChatBtn.disabled = false;
            return;
        }

        sendChatBtn.textContent = 'Stop';
        sendChatBtn.onclick = stopResponse;

        // Make the API call and handle the response
        try {
            await generateChatResponse(question);
        } catch (error) {
            console.error('Error generating response:', error);
            appendMessage('alert', 'Failed to get response. Please try again.');
        } finally {
            sendChatBtn.disabled = false;
            chatInput.focus();
        }
    }

    function stopResponse() {
        if (abortController) {
            abortController.abort();
            appendMessage('alert', 'Response generation stopped.');
        }
        sendChatBtn.textContent = 'Send';
        sendChatBtn.onclick = handleChatInput;

        abortController = null;
    }

    async function generateChatResponse(userMessage) {
        const prompt = `Human: ${userMessage}\nAI:`;

        let response = '';
        const messageEl = appendMessage('robot', 'Generating...');

        abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const stream = await aiSession.promptStreaming(prompt, { signal });

            for await (const chunk of stream) {
                updateMessageContent(messageEl, convertMarkdownToHTML(chunk));
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request was aborted');
            } else {
                console.error('Error during stream:', error);
            }
        }

        addCopyButton(messageEl);
        return response.trim();
    }

    // Function to append a new message element
    function appendMessage(role, msg) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${role}`;

        const messageContent = document.createElement('span');
        messageContent.innerHTML = msg;

        messageEl.appendChild(messageContent);
        chatMessages.style.display = 'block';
        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageEl;
    }

    // Function to update the content of an existing message element
    function updateMessageContent(messageEl, msg) {
        const messageContent = messageEl.querySelector('span');
        messageContent.innerHTML = msg;
    }

    // Function to add a copy button to each robot message
    function addCopyButton(messageEl) {
        const copyBtn = document.createElement('button');
        copyBtn.innerText = 'Copy';
        copyBtn.className = 'copy-btn';
        copyBtn.onclick = () => copyToClipboard(messageEl.querySelector('span').innerText);

        messageEl.appendChild(copyBtn);
    }

    // Copy text to clipboard
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Response copied to clipboard!');
        }).catch((error) => {
            console.error('Failed to copy text:', error);
        });
    }

    sendChatBtn.addEventListener('click', handleChatInput);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatInput();
    });

});


