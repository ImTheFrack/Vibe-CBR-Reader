// API Helpers

export async function apiGet(endpoint) {
    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            if (response.status === 401) {
                return { error: 'Unauthorized', status: 401 };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API GET ${endpoint} failed:`, error);
        return { error: error.message };
    }
}

export async function apiPost(endpoint, data) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            if (response.status === 401) {
                return { error: 'Unauthorized', status: 401 };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API POST ${endpoint} failed:`, error);
        return { error: error.message };
    }
}

export async function apiPut(endpoint, data) {
    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            if (response.status === 401) {
                return { error: 'Unauthorized', status: 401 };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API PUT ${endpoint} failed:`, error);
        return { error: error.message };
    }
}

export async function apiDelete(endpoint) {
    try {
        const response = await fetch(endpoint, { method: 'DELETE' });
        if (!response.ok) {
            if (response.status === 401) {
                return { error: 'Unauthorized', status: 401 };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API DELETE ${endpoint} failed:`, error);
        return { error: error.message };
    }
}
