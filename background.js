let extensionState = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_STATE') {
        extensionState = message.payload;
        sendResponse({ success: true });
    } else if (message.type === 'GET_STATE') {
        sendResponse({ state: extensionState });
    }
});
