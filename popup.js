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
            summaryResult.innerText = summary;
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
        const prompt = `${level === 'basic' ? 'Simplify' : 'Explain technically'} the following text:\n\n${text}`;
        try {
            const stream = await aiSession.promptStreaming(prompt);
            let response = '';

            for await (const chunk of stream) {
                response += chunk;
                simplifyResult.innerText = response;
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
                response += chunk;
                quizArea.innerText = response;
            }
        } catch (error) {
            console.error('Error generating quiz:', error);
            quizArea.innerText = 'Failed to generate quiz.';
        }
    });








    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');

    // Function to convert markdown to plain text
    function convertMarkdownToText(markdown) {
        return markdown.replace(/(\*\*|__)(.*?)\1/g, '$2')
            .replace(/(\*|_)(.*?)\1/g, '$2')
            .replace(/(#+) (.*)/g, '$2')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/\n/g, ' ');
    }

    // Function to handle sending chat input
    async function handleChatInput() {
        const question = chatInput.value.trim();
        if (!question) return;

        chatInput.value = ''; // Clear input
        appendMessage('user', question);
        sendChatBtn.disabled = true; // Disable the send button

        if (!aiSession && !(await initAI())) {
            sendChatBtn.disabled = false; // Re-enable the button if AI initialization fails
            return;
        }

        const prompt = question;
        try {
            const stream = await aiSession.promptStreaming(prompt);
            let response = '';
            let previousLength = 0; // Track previous chunk length

            // Stream response from AI
            for await (const chunk of stream) {
                const newContent = chunk.slice(previousLength);
                previousLength = chunk.length;
                response += newContent;

                const plainText = convertMarkdownToText(response);
                updateMessage('robot', plainText); // Update chat message in real-time
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            updateMessage('robot', 'Failed to get response. Please try again.');
        } finally {
            sendChatBtn.disabled = false; // Re-enable the button
            chatInput.focus(); // Focus back on the input
        }
    }

    // Function to append a new message to the chat
    function appendMessage(role, msg) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${role}`;
        messageEl.innerText = msg;
        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the bottom
    }

    // Function to update the last message from the AI
    function updateMessage(role, msg) {
        const lastMessage = Array.from(chatMessages.getElementsByClassName('chat-message'))
            .filter(el => el.classList.contains(role)).pop();
        if (lastMessage) lastMessage.innerText = msg; // Update last message text
    }

    // Event listeners for sending chat
    sendChatBtn.addEventListener('click', handleChatInput);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatInput();
    });






});
