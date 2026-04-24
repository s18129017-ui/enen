// 动态加载 API Modal HTML 并初始化
(function() {
    initStatusBarToggle();
    registerServiceWorker();

    function initStatusBarToggle() {
        var phone = document.querySelector(".phone");
        var statusBar = document.querySelector(".status-bar");
        var STORAGE_KEY = "miffy_status_bar_hidden_v1";
        var TOP_ZONE = 110;
        var lastTapAt = 0;

        if (!phone || !statusBar) {
            return;
        }

        function setHidden(hidden) {
            phone.classList.toggle("status-bar-hidden", !!hidden);
            statusBar.setAttribute("aria-hidden", hidden ? "true" : "false");
            localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
        }

        function getClientY(event) {
            if (event && typeof event.clientY === "number") {
                return event.clientY;
            }
            if (event && event.changedTouches && event.changedTouches[0]) {
                return event.changedTouches[0].clientY;
            }
            if (event && event.touches && event.touches[0]) {
                return event.touches[0].clientY;
            }
            return null;
        }

        function isTopZone(event) {
            var y = getClientY(event);
            if (y === null) {
                return false;
            }
            var rect = phone.getBoundingClientRect();
            return y >= rect.top && y <= rect.top + TOP_ZONE;
        }

        function toggleByGesture(target, event) {
            if (!isTopZone(event)) {
                return;
            }
            var hidden = phone.classList.contains("status-bar-hidden");
            if (hidden) {
                setHidden(false);
                return;
            }
            if (statusBar.contains(target)) {
                setHidden(true);
            }
        }

        setHidden(localStorage.getItem(STORAGE_KEY) === "1");

        phone.addEventListener("dblclick", function(event) {
            toggleByGesture(event.target, event);
        });

        phone.addEventListener("touchend", function(event) {
            var now = Date.now();
            if (now - lastTapAt <= 320) {
                toggleByGesture(event.target, event);
                lastTapAt = 0;
                return;
            }
            lastTapAt = now;
        }, { passive: true });
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            return;
        }

        if (location.protocol === "file:") {
            console.warn("PWA 需要 http(s) 环境，file:// 下无法注册 Service Worker。");
            return;
        }

        window.addEventListener("load", function() {
            navigator.serviceWorker.register("sw.js")
                .then(function(registration) {
                    if (registration.waiting) {
                        promptUpdate(registration);
                    }

                    registration.addEventListener("updatefound", function() {
                        var newWorker = registration.installing;
                        if (!newWorker) {
                            return;
                        }

                        newWorker.addEventListener("statechange", function() {
                            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                                promptUpdate(registration);
                            }
                        });
                    });

                    navigator.serviceWorker.addEventListener("controllerchange", function() {
                        window.location.reload();
                    });
                })
                .catch(function(err) {
                    console.error("Service worker register failed:", err);
                });
        });
    }

    function promptUpdate(registration) {
        var shouldUpdate = window.confirm("检测到新版本，是否立即更新？");
        if (!shouldUpdate) {
            return;
        }

        if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
    }

    fetch("api-modal.html")
        .then(function(response) {
            return response.text();
        })
        .then(function(html) {
            var container = document.getElementById("apiContainer");
            container.innerHTML = html;
            initApiModal();
        })
        .catch(function(err) {
            console.error("Failed to load api-modal.html:", err);
        });

    /**
     * API 预设管理类
     */
    var ApiPresetManager = {
        storageKey: "api_presets",
        activeKey: "api_active_preset",

        /**
         * 获取所有预设
         */
        getAll: function() {
            var data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        },

        /**
         * 获取活跃预设
         */
        getActive: function() {
            return localStorage.getItem(this.activeKey);
        },

        /**
         * 保存预设
         */
        save: function(preset) {
            var presets = this.getAll();
            var existing = presets.findIndex(function(p) { return p.id === preset.id; });
            
            if (existing >= 0) {
                presets[existing] = preset;
            } else {
                presets.push(preset);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(presets));
        },

        /**
         * 删除预设
         */
        delete: function(id) {
            var presets = this.getAll();
            presets = presets.filter(function(p) { return p.id !== id; });
            localStorage.setItem(this.storageKey, JSON.stringify(presets));

            // 如果删除的是活跃预设，清除活跃标记
            if (this.getActive() === id) {
                localStorage.removeItem(this.activeKey);
            }
        },

        /**
         * 设置活跃预设
         */
        setActive: function(id) {
            localStorage.setItem(this.activeKey, id);
        }
    };

    /**
     * 初始化 API Modal 事件监听
     */
    function initApiModal() {
        var apiSettingsBtn = document.getElementById("apiSettingsBtn");
        var apiModal = document.getElementById("apiModal");
        var apiCloseBtn = document.getElementById("apiCloseBtn");
        var closePanelBtn = document.getElementById("closePanelBtn");
        var fetchModelsBtn = document.getElementById("fetchModelsBtn");
        var savePresetBtn = document.getElementById("savePresetBtn");
        var resetFormBtn = document.getElementById("resetFormBtn");

        var presetNameInput = document.getElementById("presetName");
        var apiBaseUrlInput = document.getElementById("apiBaseUrl");
        var apiKeyInput = document.getElementById("apiKey");
        var apiModelSelect = document.getElementById("apiModel");
        var apiTypeSelect = document.getElementById("apiType");
        var apiActiveChip = document.getElementById("apiActiveChip");
        var presetList = document.getElementById("presetList");
        var apiMsg = document.getElementById("apiMsg");

        if (!apiSettingsBtn || !apiModal) {
            console.error("API modal elements not found");
            return;
        }

        /**
         * 打开 API 配置面板
         */
        function openModal() {
            apiModal.classList.add("show");
            renderPresetList();
            updateActiveChip();
        }

        /**
         * 关闭 API 配置面板
         */
        function closeModal() {
            apiModal.classList.remove("show");
        }

        /**
         * 显示提示消息
         */
        function showMsg(text, type) {
            type = type || "info"; // info, error, success
            apiMsg.textContent = text;
            apiMsg.style.color = type === "error" ? "#dc3b3b" : (type === "success" ? "#6ba587" : "var(--text-sub)");
            
            if (type !== "info") {
                setTimeout(function() {
                    apiMsg.textContent = "";
                }, 3000);
            }
        }

        /**
         * 更新活跃预设芯片
         */
        function updateActiveChip() {
            var activeId = ApiPresetManager.getActive();
            if (activeId) {
                var presets = ApiPresetManager.getAll();
                var active = presets.find(function(p) { return p.id === activeId; });
                if (active) {
                    apiActiveChip.textContent = "当前启用：" + active.name;
                    return;
                }
            }
            apiActiveChip.textContent = "当前启用：未选择";
        }

        /**
         * 渲染预设列表
         */
        function renderPresetList() {
            var presets = ApiPresetManager.getAll();
            var activeId = ApiPresetManager.getActive();

            if (presets.length === 0) {
                presetList.innerHTML = '<div class="preset-empty">还没有预设，先保存一个吧</div>';
                return;
            }

            presetList.innerHTML = presets.map(function(preset) {
                return '<div class="preset-item' + (preset.id === activeId ? " active" : "") + '">' +
                    '<div class="preset-main" data-preset-id="' + preset.id + '">' +
                    '<div class="preset-name">' + escapeHtml(preset.name) + '</div>' +
                    '<div class="preset-meta">URL: ' + escapeHtml(preset.baseUrl.substring(0, 30)) + '...</div>' +
                    '</div>' +
                    '<div class="preset-ops">' +
                    '<button class="preset-op del" data-delete-id="' + preset.id + '">删除</button>' +
                    '</div>' +
                    '</div>';
            }).join("");

            // 绑定预设加载事件
            document.querySelectorAll(".preset-main").forEach(function(el) {
                el.addEventListener("click", function() {
                    var presetId = el.getAttribute("data-preset-id");
                    var preset = presets.find(function(p) { return p.id === presetId; });
                    if (preset) {
                        loadPresetToForm(preset);
                        ApiPresetManager.setActive(preset.id);
                        updateActiveChip();
                        renderPresetList();
                        showMsg("预设已加载并启用", "success");
                    }
                });
            });

            // 绑定删除事件
            document.querySelectorAll(".preset-op.del").forEach(function(btn) {
                btn.addEventListener("click", function(e) {
                    e.stopPropagation();
                    var presetId = btn.getAttribute("data-delete-id");
                    if (confirm("确定删除该预设吗？")) {
                        ApiPresetManager.delete(presetId);
                        updateActiveChip();
                        renderPresetList();
                        showMsg("预设已删除", "success");
                    }
                });
            });
        }

        /**
         * 加载预设到表单
         */
        function loadPresetToForm(preset) {
            presetNameInput.value = preset.name;
            apiBaseUrlInput.value = preset.baseUrl;
            apiKeyInput.value = preset.apiKey;
            apiTypeSelect.value = preset.type;
            apiModelSelect.innerHTML = '<option value="' + preset.model + '">' + preset.model + '</option>';
        }

        /**
         * 获取表单数据
         */
        function getFormData() {
            return {
                id: Date.now().toString(),
                name: presetNameInput.value.trim(),
                baseUrl: apiBaseUrlInput.value.trim(),
                apiKey: apiKeyInput.value.trim(),
                type: apiTypeSelect.value,
                model: apiModelSelect.value
            };
        }

        /**
         * 验证表单
         */
        function validateForm() {
            var data = getFormData();
            if (!data.name) {
                showMsg("预设名称不能为空", "error");
                return false;
            }
            if (!data.baseUrl) {
                showMsg("API URL 不能为空", "error");
                return false;
            }
            if (!data.apiKey) {
                showMsg("API Key 不能为空", "error");
                return false;
            }
            if (!data.model) {
                showMsg("请先拉取模型", "error");
                return false;
            }
            return true;
        }

        /**
         * 拉取模型列表
         */
        function fetchModels() {
            var baseUrl = apiBaseUrlInput.value.trim();
            var apiKey = apiKeyInput.value.trim();

            if (!baseUrl || !apiKey) {
                showMsg("请先填写 API URL 和 API Key", "error");
                return;
            }

            fetchModelsBtn.disabled = true;
            fetchModelsBtn.textContent = "拉取中...";
            showMsg("正在拉取模型...", "info");

            var normalizedBase = normalizeBaseUrl(baseUrl);
            var candidateUrls = [
                normalizedBase + "/models",
                normalizedBase + "/v1/models"
            ];

            fetchModelsByCandidates(candidateUrls, apiKey)
                .then(function(models) {
                    if (!models.length) {
                        showMsg("未获取到任何模型", "error");
                        return;
                    }

                    // 更新模型下拉菜单
                    apiModelSelect.innerHTML = models.map(function(model) {
                        var modelId = model.id || model;
                        return '<option value="' + escapeHtml(modelId) + '">' + escapeHtml(modelId) + '</option>';
                    }).join("");

                    showMsg("模型拉取成功，共 " + models.length + " 个", "success");
                })
                .catch(function(err) {
                    var tip = "拉取模型失败：" + err.message;
                    if (String(err.message).indexOf("CORS") >= 0 || String(err.message).indexOf("Failed to fetch") >= 0) {
                        tip += "；请确认服务端已开启跨域，并使用 http(s) 方式打开页面";
                    }
                    showMsg(tip, "error");
                    console.error("Fetch models error:", err);
                })
                .finally(function() {
                    fetchModelsBtn.disabled = false;
                    fetchModelsBtn.textContent = "拉取模型";
                });
        }

        function normalizeBaseUrl(url) {
            var result = url.replace(/\/+$/, "");

            // 用户可能粘贴了完整聊天端点，统一回退到基础路径
            result = result.replace(/\/chat\/completions$/i, "");
            result = result.replace(/\/completions$/i, "");

            return result;
        }

        function fetchModelsByCandidates(urls, apiKey) {
            var index = 0;

            function tryNext(lastErr) {
                if (index >= urls.length) {
                    return Promise.reject(lastErr || new Error("无法访问模型接口"));
                }

                var targetUrl = urls[index++];
                return fetchWithTimeout(targetUrl, {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + apiKey,
                        "Content-Type": "application/json"
                    }
                }, 12000)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error("HTTP " + response.status + " @ " + targetUrl);
                    }
                    return response.json();
                })
                .then(function(data) {
                    var models = [];
                    if (Array.isArray(data)) {
                        models = data;
                    } else if (Array.isArray(data.data)) {
                        models = data.data;
                    } else if (Array.isArray(data.models)) {
                        models = data.models;
                    }
                    return models;
                })
                .catch(function(err) {
                    return tryNext(err);
                });
            }

            return tryNext();
        }

        function fetchWithTimeout(url, options, timeoutMs) {
            var controller = new AbortController();
            var timer = setTimeout(function() {
                controller.abort();
            }, timeoutMs);

            var merged = Object.assign({}, options, { signal: controller.signal });
            return fetch(url, merged)
                .finally(function() {
                    clearTimeout(timer);
                })
                .catch(function(err) {
                    if (err && err.name === "AbortError") {
                        throw new Error("请求超时");
                    }
                    throw err;
                });
        }

        /**
         * 保存预设
         */
        function savePreset() {
            if (!validateForm()) {
                return;
            }

            var data = getFormData();
            data.id = Date.now().toString(); // 生成唯一ID
            ApiPresetManager.save(data);
            ApiPresetManager.setActive(data.id);
            showMsg("预设保存成功", "success");
            renderPresetList();
            updateActiveChip();
        }

        /**
         * 重置表单
         */
        function resetForm() {
            presetNameInput.value = "";
            apiBaseUrlInput.value = "";
            apiKeyInput.value = "";
            apiModelSelect.innerHTML = '<option value="">请先拉取模型</option>';
            apiTypeSelect.value = "openai";
            showMsg("表单已清空", "success");
        }

        /**
         * 转义HTML特殊字符
         */
        function escapeHtml(str) {
            if (!str) return "";
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // 事件监听
        apiSettingsBtn.addEventListener("click", openModal);
        apiCloseBtn.addEventListener("click", closeModal);
        closePanelBtn.addEventListener("click", closeModal);
        fetchModelsBtn.addEventListener("click", fetchModels);
        savePresetBtn.addEventListener("click", savePreset);
        resetFormBtn.addEventListener("click", resetForm);

        // 点击面板外背景也可以关闭
        apiModal.addEventListener("click", function(e) {
            if (e.target === apiModal) {
                closeModal();
            }
        });

        // 初始化时渲染预设列表
        renderPresetList();
        updateActiveChip();
    }
})();
