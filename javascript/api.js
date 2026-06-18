document.addEventListener("DOMContentLoaded", function () {
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("user-input");
    const chatMessages = document.getElementById("chat-messages");

    const OLLAMA_API_URL = "http://localhost:11434/api/chat";

    let conversationHistory = [];
    let loadingMessageElement = null;

    function showLoadingIndicator() {
        removeLoadingIndicator();

        const loadingMessage = document.createElement("div");
        loadingMessage.className = "message assistant-message loading-message";

        const bubble = document.createElement("div");
        bubble.className = "bubble loading-bubble";

        const dots = document.createElement("div");
        dots.className = "loading-indicator";

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement("span");
            dot.className = "loading-dot";
            dots.appendChild(dot);
        }

        bubble.appendChild(dots);
        loadingMessage.appendChild(bubble);
        chatMessages.appendChild(loadingMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        loadingMessageElement = loadingMessage;
    }

    function removeLoadingIndicator() {
        if (loadingMessageElement && loadingMessageElement.parentNode) {
            loadingMessageElement.parentNode.removeChild(loadingMessageElement);
            loadingMessageElement = null;
        }
    }

    function appendMessage(sender, text) {
        const messageElement = document.createElement("div");
        messageElement.className = `message ${sender.toLowerCase()}-message`;

        const bubble = document.createElement("div");
        bubble.className = "bubble";

        const senderLabel = document.createElement("div");
        senderLabel.className = "sender-label";
        senderLabel.textContent = sender;

        //ici bon , pas touche 

        chatMessages.scrollTop = chatMessages.scrollHeight;

        const textElement = document.createElement("div");
        const formattedText = formatCodeBlocks(text);
        textElement.innerHTML = formattedText;

        bubble.appendChild(senderLabel);
        bubble.appendChild(textElement);
        messageElement.appendChild(bubble);
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- conservation de discussions ---
    const conversationsListEl = document.getElementById('conversations-list');
    const newChatBtn = document.getElementById('new-chat');
    const saveChatBtn = document.getElementById('save-chat');

    let conversations = [];
    let currentConversationId = null;

    function loadConversationsFromStorage() {
        try {
            const raw = localStorage.getItem('conversations');
            conversations = raw ? JSON.parse(raw) : [];
        } catch (e) {
            conversations = [];
        }
        renderConversationsList();
    }

    function persistConversations() {
        try {
            localStorage.setItem('conversations', JSON.stringify(conversations));
        } catch (e) {
            console.error('Impossible de sauvegarder les conversations', e);
        }
    }

    function deriveTitle(history, fallback) {
        const firstUser = history.find(m => m.role === 'user');
        if (firstUser) return firstUser.content.slice(0, 30) + (firstUser.content.length > 30 ? '…' : '');
        return fallback || `Conversation ${conversations.length + 1}`;
    }

    function renderConversationsList() {
        if (!conversationsListEl) return;
        conversationsListEl.innerHTML = '';
        conversations.forEach(conv => {
            const li = document.createElement('li');
            li.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
            li.dataset.id = conv.id;

            const title = document.createElement('span');
            title.className = 'title';
            title.textContent = conv.title || deriveTitle(conv.messages);

            const snippet = document.createElement('span');
            snippet.className = 'snippet';
            const last = conv.messages[conv.messages.length - 1];
            snippet.textContent = last ? (last.content || '').slice(0, 60) : '';

            const preview = document.createElement('div');
            preview.className = 'preview';
            preview.textContent = conv.messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');

            li.appendChild(title);
            li.appendChild(snippet);
            li.appendChild(preview);

            li.addEventListener('click', function () {
                loadConversation(conv.id);
            });

            conversationsListEl.appendChild(li);
        });
    }

    function saveConversation() {
        if (!conversationHistory || conversationHistory.length === 0) return;
        if (currentConversationId) {
            const idx = conversations.findIndex(c => c.id === currentConversationId);
            if (idx !== -1) {
                conversations[idx].messages = [...conversationHistory];
                conversations[idx].title = deriveTitle(conversationHistory, conversations[idx].title);
            }
        } else {
            const id = 'c_' + Date.now();
            const title = deriveTitle(conversationHistory);
            conversations.unshift({ id, title, messages: [...conversationHistory] });
            currentConversationId = id;
        }
        persistConversations();
        renderConversationsList();
    }

    function autoSaveIfOpen() {
        if (!currentConversationId) return;
        const idx = conversations.findIndex(c => c.id === currentConversationId);
        if (idx !== -1) {
            conversations[idx].messages = [...conversationHistory];
            persistConversations();
            renderConversationsList();
        }
    }

    function loadConversation(id) {
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        currentConversationId = id;
        conversationHistory = conv.messages.map(m => ({ role: m.role, content: m.content }));
        chatMessages.innerHTML = '';
        conversationHistory.forEach(m => appendMessage(m.role === 'user' ? 'User' : (m.role === 'assistant' ? 'Assistant' : 'Système'), m.content));
        renderConversationsList();
    }

    function newConversation() {
        conversationHistory = [];
        currentConversationId = null;
        chatMessages.innerHTML = '';
        renderConversationsList();
    }

    if (newChatBtn) newChatBtn.addEventListener('click', newConversation);
    if (saveChatBtn) saveChatBtn.addEventListener('click', saveConversation);

    // Charger au démarrage
    loadConversationsFromStorage();

    chatForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        appendMessage("User", userMessage);
        userInput.value = "";
        userInput.focus();
        showLoadingIndicator();

        try {
            conversationHistory.push({
                role: "user",
                content: userMessage,
            });
            autoSaveIfOpen();

            const messages = [
                {
                    role: "system",
                    content: "You are a helpful assistant."
                },
                ...conversationHistory,
            ];

            const requestData = {
                model: "llama3.2:3b",
                messages: messages,
                stream: false,
            };

            const response = await fetch(OLLAMA_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const data = await response.json();
            const assistantContent =
                data?.choices?.[0]?.message?.content ||
                data?.message?.content ||
                data?.choices?.[0]?.content ||
                "Désolé, je n'ai pas reçu de réponse de l'IA.";

            conversationHistory.push({
                role: "assistant",
                content: assistantContent,
            });

            removeLoadingIndicator();
            appendMessage("Assistant", assistantContent);
            // inshallah ça marche
            saveConversation();
        } catch (error) {
            removeLoadingIndicator();
            console.error(
                "Erreur lors de la communication avec Ollama:",
                error
            );
            appendMessage(
                "Système",
                "Désolé, une erreur est survenue lors de la communication avec l'IA."
            );
        }
    });

    function formatCodeBlocks(text) {
        const escapedText = escapeHTML(text);

        const formattedText = escapedText.replace(
            /```([a-z]*)\n([\s\S]*?)\n```/g,
            function (match, language, code) {
                return `<pre><code class="language-${language}">${escapeHTML(
                    code
                )}</code></pre>`;
            }
        );

        return formattedText.replace(/`([^`]+)`/g, "<code>$1</code>");
    }

    function escapeHTML(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
