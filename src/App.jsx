import {
  Camera,
  Check,
  Copy,
  Heart,
  ImagePlus,
  LogOut,
  Menu,
  MessageCircle,
  MoreVertical,
  PanelLeftClose,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useEffect, useMemo, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import meAvatar from './image/me.jpg';
import rainbowseekAvatar from './image/rainbowseek.png';

async function api(path, options = {}) {
  const { cacheBust = false, ...fetchOptions } = options;
  const requestPath = cacheBust ? withCacheBust(path) : path;
  const response = await fetch(requestPath, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers ?? {}),
    },
    ...fetchOptions,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '请求失败');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function withCacheBust(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}_=${Date.now()}`;
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function MarkdownMessage({ content }) {
  return (
    <ReactMarkdown
      components={{ code: CodeBlock, pre: ({ children }) => children }}
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
    >
      {normalizeMarkdownForDisplay(normalizeMathDelimiters(content))}
    </ReactMarkdown>
  );
}

function normalizeMarkdownForDisplay(value) {
  const lines = String(value ?? '').replace(/\r\n/g, '\n').split('\n');
  const normalized = [];
  let previousWasBlank = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, '');
    const isBlank = line.trim() === '';
    if (isBlank) {
      if (!previousWasBlank) {
        normalized.push('');
      }
      previousWasBlank = true;
      continue;
    }
    normalized.push(line);
    previousWasBlank = false;
  }

  return normalized.join('\n').trim();
}

function normalizeMathDelimiters(value) {
  return String(value ?? '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => `$$${expression}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression}$`);
}

function CodeBlock({ children, className, ...props }) {
  const code = String(children ?? '').replace(/\n$/, '');
  const language = /language-(\w+)/.exec(className || '')?.[1];
  const isInline = !className;
  const [copied, setCopied] = useState(false);

  if (isInline) {
    return <code {...props}>{children}</code>;
  }

  async function copyCode() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="code-panel">
      <div className="code-panel-header">
        <span>{language || 'code'}</span>
        <button
          aria-label={copied ? '已复制代码' : '复制代码'}
          className="code-copy"
          onClick={copyCode}
          title={copied ? '已复制代码' : '复制代码'}
          type="button"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function modelLabel(model) {
  return model === 'deepseek-v4-pro' ? 'V4 Pro' : 'V4 Flash';
}

function normalizeDisplayText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function updateStreamingMessage(conversation, messageId, { contentDelta = '', reasoningDelta = '' }) {
  if (!conversation) return conversation;
  return {
    ...conversation,
    messages: conversation.messages.map((message) => {
      if (message.id !== messageId) return message;
      return {
        ...message,
        content: `${message.content ?? ''}${contentDelta}`,
        reasoning: reasoningDelta ? `${message.reasoning ?? ''}${reasoningDelta}` : message.reasoning,
        reasoningOpen: reasoningDelta ? true : message.reasoningOpen,
        visualStatus: contentDelta || reasoningDelta ? null : message.visualStatus,
      };
    }),
  };
}

function isConversationSnapshotNewer(localConversation, remoteConversation) {
  if (!localConversation || localConversation.id !== remoteConversation?.id) return true;
  const localMessages = localConversation.messages ?? [];
  const remoteMessages = remoteConversation.messages ?? [];
  if (remoteMessages.length < localMessages.length) return false;
  if (remoteMessages.length > localMessages.length) return true;
  const remoteHasShorterMessage = localMessages.some((localMessage, index) => {
    const remoteMessage = remoteMessages[index];
    if (!remoteMessage || remoteMessage.role !== localMessage.role) return true;
    return (
      String(remoteMessage.content ?? '').length < String(localMessage.content ?? '').length ||
      String(remoteMessage.reasoning ?? '').length < String(localMessage.reasoning ?? '').length
    );
  });
  if (remoteHasShorterMessage) return false;
  return new Date(remoteConversation.updatedAt ?? 0).getTime() >= new Date(localConversation.updatedAt ?? 0).getTime();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function fileToImageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.84),
          name: file.name || 'image',
        });
      };
      image.onerror = () => resolve({ dataUrl, name: file.name || 'image' });
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function filesToImages(files) {
  const imageFiles = Array.from(files ?? [])
    .filter((file) => file.type?.startsWith('image/'))
    .slice(0, 4);
  return Promise.all(imageFiles.map(fileToImageData));
}

function readFileAsText(file) {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

async function fileToTextAttachment(file) {
  const content = await readFileAsText(file);
  return {
    name: (file.name || 'attachment.txt').slice(0, 120),
    content: content.slice(0, 12000),
  };
}

async function filesToTextAttachments(files) {
  const textFiles = Array.from(files ?? [])
    .filter((file) => !file.type?.startsWith('image/'))
    .slice(0, 4);
  return Promise.all(textFiles.map(fileToTextAttachment));
}

function readComposerHeight(composerRef) {
  const element = composerRef?.current;
  if (!element) return 120;
  const rectHeight = Math.ceil(element.getBoundingClientRect?.().height || 0);
  return rectHeight || element.offsetHeight || 120;
}

function useVisualViewportVariables(composerRef, measureKey = '') {
  const [viewportSignal, setViewportSignal] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const viewport = window.visualViewport;
    const root = document.documentElement;

    function updateViewportVariables(shouldNotify = false) {
      const visualHeight = Math.round(viewport?.height || window.innerHeight || root.clientHeight || 0);
      const layoutHeight = Math.round(window.innerHeight || visualHeight);
      const offsetTop = Math.round(viewport?.offsetTop || 0);
      const keyboardInset = Math.max(0, layoutHeight - visualHeight - offsetTop);
      const composerHeight = readComposerHeight(composerRef);
      const composerSafeSpace = keyboardInset + composerHeight;
      if (visualHeight > 0) {
        root.style.setProperty('--app-viewport-height', `${visualHeight}px`);
      }
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
      root.style.setProperty('--composer-height', `${composerHeight}px`);
      root.style.setProperty('--composer-keyboard-offset', `${keyboardInset}px`);
      root.style.setProperty('--composer-safe-space', `${composerSafeSpace}px`);
      if (shouldNotify) {
        setViewportSignal((value) => value + 1);
      }
    }

    updateViewportVariables();
    const handleViewportChange = () => updateViewportVariables(true);
    viewport?.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && composerRef?.current ? new ResizeObserver(() => updateViewportVariables()) : null;
    if (resizeObserver && composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }

    return () => {
      viewport?.removeEventListener('resize', handleViewportChange);
      viewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      resizeObserver?.disconnect();
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--composer-height');
      root.style.removeProperty('--composer-keyboard-offset');
      root.style.removeProperty('--composer-safe-space');
    };
  }, [composerRef, measureKey]);

  return viewportSignal;
}

async function readStreamingChat(response, handlers) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || '请求失败');
    error.status = response.status;
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('当前浏览器不支持流式输出');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      await handlers[event.type]?.(event);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = JSON.parse(buffer);
    await handlers[event.type]?.(event);
  }
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('rainbow');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = await api('/.netlify/functions/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="登录">
        <div className="login-mark">
          <Sparkles size={28} />
        </div>
        <p className="eyebrow">For Rainbow Only</p>
        <h1>rainbowseek</h1>
        <p className="login-copy">专门为彩虹开发的 DeepSeek，聊天记录会在不同设备间同步。</p>
        <form className="login-form" onSubmit={submit}>
          <label>
            用户名
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="error-line">{error}</div>}
          <button className="primary-button" disabled={loading} type="submit">
            <Heart size={18} />
            {loading ? '登录中' : '进入聊天'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ConversationActions({ conversation, onRename, onPin, onDelete }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="conversation-actions">
      <button
        aria-label="更多操作"
        className="icon-button small"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        type="button"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="action-menu">
          <button
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onRename(conversation);
            }}
            type="button"
          >
            <Pencil size={15} />
            重命名
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onPin(conversation);
            }}
            type="button"
          >
            {conversation.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            {conversation.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            className="danger"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onDelete(conversation);
            }}
            type="button"
          >
            <Trash2 size={15} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

function Dialog({ dialog, onCancel, onConfirm, onRenameValueChange }) {
  if (!dialog) return null;

  const isRename = dialog.type === 'rename';
  const title = isRename ? '重命名聊天' : '删除这段聊天？';
  const description = isRename
    ? '给这段聊天换一个好认的名字。'
    : `删除「${dialog.conversation.title}」后，这段记录会从所有设备移除。`;

  function submit(event) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form aria-modal="true" className="dialog-panel" onSubmit={submit} role="dialog">
        <div className="dialog-mark">
          {isRename ? <Pencil size={20} /> : <Trash2 size={20} />}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        {isRename && (
          <input
            autoFocus
            className="dialog-input"
            maxLength={80}
            onChange={(event) => onRenameValueChange(event.target.value)}
            value={dialog.value}
          />
        )}
        <div className="dialog-actions">
          <button className="dialog-secondary" onClick={onCancel} type="button">
            取消
          </button>
          <button className={isRename ? 'dialog-primary' : 'dialog-danger'} type="submit">
            {isRename ? '保存' : '删除'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Sidebar({
  activeId,
  conversations,
  mobileOpen,
  onCloseMobile,
  onCreate,
  onDelete,
  onLogout,
  onPin,
  onRename,
  onSelect,
  sidebarOpen,
}) {
  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">
          <span className="brand-glyph">
            <Sparkles size={18} />
          </span>
          <span>rainbowseek</span>
        </div>
        <button aria-label="关闭侧栏" className="icon-button mobile-only" onClick={onCloseMobile} type="button">
          <X size={18} />
        </button>
      </div>
      <button className="new-chat" onClick={onCreate} type="button">
        <Plus size={17} />
        新聊天
      </button>
      <nav className="conversation-list" aria-label="聊天记录">
        {conversations.length === 0 && (
          <div className="empty-list">
            <MessageCircle size={18} />
            还没有聊天
          </div>
        )}
        {conversations.map((conversation) => (
          <div
            className={`conversation-row ${conversation.id === activeId ? 'active' : ''}`}
            key={conversation.id}
          >
            <button className="conversation-main" onClick={() => onSelect(conversation.id)} type="button">
              <span className="conversation-title">
                {conversation.pinned && <Pin size={13} />}
                {conversation.title}
              </span>
              <span className="conversation-time">{formatTime(conversation.updatedAt)}</span>
            </button>
            <ConversationActions
              conversation={conversation}
              onDelete={onDelete}
              onPin={onPin}
              onRename={onRename}
            />
          </div>
        ))}
      </nav>
      <button className="logout-button" onClick={onLogout} type="button">
        <LogOut size={16} />
        退出
      </button>
    </aside>
  );
}

function MessageActions({ message, onCopy, onEdit }) {
  return (
    <div className="message-actions">
      <button aria-label="复制消息" className="message-action" onClick={() => onCopy(message.content)} type="button">
        <Copy size={18} />
      </button>
      {message.role === 'user' && (
        <button aria-label="编辑消息" className="message-action" onClick={() => onEdit(message.content)} type="button">
          <Pencil size={17} />
        </button>
      )}
    </div>
  );
}

function MessageAvatar({ role }) {
  const isUser = role === 'user';
  return (
    <div className="message-avatar">
      <img alt={isUser ? '我' : 'rainbowseek'} src={isUser ? meAvatar : rainbowseekAvatar} />
    </div>
  );
}

function ReasoningBlock({ open, reasoning }) {
  if (!reasoning) return null;
  return (
    <details className="reasoning-block" open={open}>
      <summary>{open ? '正在思考' : '思路摘要'}</summary>
      <MarkdownMessage content={normalizeDisplayText(reasoning)} />
    </details>
  );
}

function ImageDescriptionBlock({ description }) {
  if (!description) return null;
  return (
    <details className="context-block">
      <summary>图片识别结果</summary>
      <MarkdownMessage content={normalizeDisplayText(description)} />
    </details>
  );
}

function SearchSources({ webSearch }) {
  const results = Array.isArray(webSearch?.results) ? webSearch.results.filter((item) => item?.url) : [];
  if (!webSearch?.answer && results.length === 0) return null;
  return (
    <details className="context-block source-block">
      <summary>联网搜索来源</summary>
      {webSearch?.answer && <p>{webSearch.answer}</p>}
      {results.length > 0 && (
        <ol className="source-list">
          {results.map((result, index) => (
            <li key={`${result.url}-${index}`}>
              <a href={result.url} rel="noreferrer" target="_blank">
                {result.title || result.url}
              </a>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function VisualStatus({ status }) {
  if (!status) return null;
  return (
    <div className="visual-status" role="status">
      <span />
      {status}
    </div>
  );
}

function MessageList({ keyboardScrollSignal = 0, messages, loading, onCopy, onEdit, forceScrollSignal = 0 }) {
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const consumedForceScrollSignalRef = useRef(0);
  const keyboardScrollUntilRef = useRef(0);

  function updateStickToBottom() {
    const element = messagesRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
    if (!shouldStickToBottomRef.current) {
      keyboardScrollUntilRef.current = 0;
    }
  }

  function scrollToBottom(behavior = 'smooth') {
    bottomRef.current?.scrollIntoView?.({ behavior });
  }

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) return undefined;
    element.addEventListener('scroll', updateStickToBottom, { passive: true });
    return () => element.removeEventListener('scroll', updateStickToBottom);
  }, []);

  useEffect(() => {
    const hasNewForceScroll = forceScrollSignal > consumedForceScrollSignalRef.current;
    if (hasNewForceScroll) {
      consumedForceScrollSignalRef.current = forceScrollSignal;
      keyboardScrollUntilRef.current = Date.now() + 900;
    }
    if (shouldStickToBottomRef.current || hasNewForceScroll) {
      scrollToBottom(hasNewForceScroll ? 'auto' : 'smooth');
      shouldStickToBottomRef.current = true;
    }
  }, [messages, loading, forceScrollSignal]);

  useEffect(() => {
    if (keyboardScrollSignal > 0 && keyboardScrollUntilRef.current > Date.now()) {
      scrollToBottom('auto');
    }
  }, [keyboardScrollSignal]);

  if (messages.length === 0) {
    return (
      <div className="welcome">
        <div className="welcome-badge">
          <Heart size={22} />
        </div>
        <h2>今天想问点什么？</h2>
        <p>可以聊论文、代码、生活安排，也可以让它帮你写一段甜甜的文案。</p>
      </div>
    );
  }

  return (
    <div className="messages" onScroll={updateStickToBottom} ref={messagesRef}>
      {messages.map((message) => (
        <article className={`message ${message.role}`} key={message.id ?? `${message.role}-${message.createdAt}`}>
          <MessageAvatar role={message.role} />
          <div className="message-content">
            <div className="message-bubble">
              {message.model && <div className="message-model">{modelLabel(message.model)}</div>}
              <VisualStatus status={message.visualStatus} />
              {message.role === 'assistant' && <ImageDescriptionBlock description={message.imageDescription} />}
              {message.role === 'assistant' && <SearchSources webSearch={message.webSearch} />}
              <ReasoningBlock open={Boolean(message.reasoningOpen)} reasoning={message.reasoning} />
              <MarkdownMessage content={normalizeDisplayText(message.content)} />
            </div>
            <MessageActions message={message} onCopy={onCopy} onEdit={onEdit} />
          </div>
        </article>
      ))}
      {loading && !messages.some((message) => message.id?.startsWith?.('streaming-')) && (
        <article className="message assistant">
          <MessageAvatar role="assistant" />
          <div className="message-bubble typing">正在思考</div>
        </article>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function Composer({
  canRegenerate,
  canStop,
  disabled,
  files,
  images,
  model,
  onFileAdd,
  onFileRemove,
  onImageAdd,
  onImageRemove,
  onModelChange,
  onRegenerate,
  onSearchToggle,
  onSend,
  onStop,
  value,
  onChange,
  onFocus,
  webSearchEnabled,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const documentInputRef = useRef(null);

  function submit(event) {
    event.preventDefault();
    const message = value.trim();
    if ((!message && images.length === 0 && files.length === 0) || disabled) return;
    onSend(message || (files.length > 0 ? '请根据上传文件回答。' : '请识别并回答图片内容。'), model);
  }

  async function addFiles(files) {
    const nextImages = await filesToImages(files);
    if (nextImages.length > 0) {
      onImageAdd(nextImages);
    }
  }

  async function addTextFiles(files) {
    const nextFiles = await filesToTextAttachments(files);
    if (nextFiles.length > 0) {
      onFileAdd(nextFiles);
    }
  }

  async function handlePaste(event) {
    const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type?.startsWith('image/'));
    if (imageFiles.length > 0) {
      await addFiles(imageFiles);
    }
  }

  return (
    <div className="composer-panel">
      <div className="composer-tools" aria-label="模型选择">
        {['deepseek-v4-flash', 'deepseek-v4-pro'].map((item) => (
          <button
            className={`model-chip ${model === item ? 'active' : ''}`}
            key={item}
            onClick={() => onModelChange(item)}
            type="button"
          >
            {model === item && <Check size={14} />}
            {modelLabel(item)}
          </button>
        ))}
        <button
          aria-label="联网搜索"
          className={`tool-chip ${webSearchEnabled ? 'active' : ''}`}
          onClick={() => onSearchToggle((value) => !value)}
          title="联网搜索"
          type="button"
        >
          <Wifi size={14} />
          搜索
        </button>
        {canStop && (
          <button aria-label="停止生成" className="tool-chip danger" onClick={onStop} title="停止生成" type="button">
            <Square size={13} />
            停止
          </button>
        )}
        {!canStop && canRegenerate && (
          <button aria-label="重新生成" className="tool-chip" onClick={onRegenerate} title="重新生成" type="button">
            <RefreshCcw size={14} />
            重试
          </button>
        )}
      </div>
      {images.length > 0 && (
        <div className="image-preview-list">
          {images.map((image, index) => (
            <div className="image-preview" key={`${image.name}-${index}`}>
              <img alt={image.name || `image-${index + 1}`} src={image.dataUrl} />
              <button aria-label="移除图片" onClick={() => onImageRemove(index)} type="button">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="file-preview-list">
          {files.map((file, index) => (
            <div className="file-preview" key={`${file.name}-${index}`}>
              <Paperclip size={14} />
              <span>{file.name}</span>
              <button aria-label="移除文件" onClick={() => onFileRemove(index)} type="button">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <input
          accept="image/*"
          aria-label="上传图片"
          multiple
          onChange={(event) => {
            addFiles(event.target.files).catch(() => {});
            event.target.value = '';
          }}
          ref={fileInputRef}
          type="file"
        />
        <input
          accept="image/*"
          aria-label="拍照上传"
          capture="environment"
          onChange={(event) => {
            addFiles(event.target.files).catch(() => {});
            event.target.value = '';
          }}
          ref={cameraInputRef}
          type="file"
        />
        <input
          accept=".txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.html,.css,.xml,.yaml,.yml,text/*,application/json"
          aria-label="上传文件"
          multiple
          onChange={(event) => {
            addTextFiles(event.target.files).catch(() => {});
            event.target.value = '';
          }}
          ref={documentInputRef}
          type="file"
        />
        <button
          aria-label="上传图片"
          className="composer-icon-button"
          onClick={() => fileInputRef.current?.click()}
          title="上传图片"
          type="button"
        >
          <ImagePlus size={18} />
        </button>
        <button
          aria-label="拍照"
          className="composer-icon-button camera-button"
          onClick={() => cameraInputRef.current?.click()}
          title="拍照"
          type="button"
        >
          <Camera size={18} />
        </button>
        <button
          aria-label="上传文件"
          className="composer-icon-button"
          onClick={() => documentInputRef.current?.click()}
          title="上传文件"
          type="button"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onClick={onFocus}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(event);
            }
          }}
          onPaste={handlePaste}
          placeholder="发消息给 rainbowseek..."
          rows={1}
          value={value}
        />
        <button
          aria-label="发送"
          className="send-button"
          disabled={disabled || (!value.trim() && images.length === 0 && files.length === 0)}
          type="submit"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function ChatApp({ session, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [composerValue, setComposerValue] = useState('');
  const [composerFocusScrollSignal, setComposerFocusScrollSignal] = useState(0);
  const [composerImages, setComposerImages] = useState([]);
  const [composerFiles, setComposerFiles] = useState([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash');
  const [notice, setNotice] = useState('');
  const streamingConversationIdRef = useRef(null);
  const recentlyCompletedConversationIdRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestSeqRef = useRef(0);
  const activeIdRef = useRef(null);
  const deletedConversationIdsRef = useRef(new Set());
  const composerWrapRef = useRef(null);
  const composerMeasureKey = `${composerImages.length}:${composerFiles.length}:${loading ? 'loading' : 'idle'}`;
  const viewportSignal = useVisualViewportVariables(composerWrapRef, composerMeasureKey);

  const activeMessages = activeConversation?.messages ?? [];
  const activeTitle = useMemo(() => activeConversation?.title || '新的聊天', [activeConversation]);

  function updateActiveId(id) {
    activeIdRef.current = id;
    setActiveId(id);
  }

  async function refreshConversations(options = {}) {
    const payload = await api('/.netlify/functions/conversations', { cacheBust: true });
    const nextConversations = payload.conversations.filter(
      (conversation) => !deletedConversationIdsRef.current.has(conversation.id),
    );
    const currentActiveId = activeIdRef.current;
    setConversations(nextConversations);
    if (
      currentActiveId &&
      !options.keepActive &&
      !nextConversations.some((conversation) => conversation.id === currentActiveId)
    ) {
      updateActiveId(null);
      setActiveConversation(null);
    }
    return nextConversations;
  }

  async function recoverMissingConversation(options = {}) {
    updateActiveId(null);
    setActiveConversation(null);
    if (!options.silent) {
      setError('这段聊天已经不存在，已为你切回新的聊天。');
    }
    await refreshConversations();
  }

  async function loadConversation(id) {
    if (!id) {
      setActiveConversation(null);
      return;
    }
    try {
      const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(id)}`, { cacheBust: true });
      if (activeIdRef.current !== id) {
        return;
      }
      setActiveConversation((current) =>
        isConversationSnapshotNewer(current, payload.conversation) ? payload.conversation : current,
      );
    } catch (err) {
      if (err.status === 404 || err.message === 'Conversation not found') {
        if (activeIdRef.current !== id) {
          return;
        }
        await recoverMissingConversation();
        return;
      }
      throw err;
    }
  }

  useEffect(() => {
    refreshConversations().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (activeId && (streamingConversationIdRef.current === activeId || recentlyCompletedConversationIdRef.current === activeId)) {
      if (recentlyCompletedConversationIdRef.current === activeId) {
        recentlyCompletedConversationIdRef.current = null;
      }
      return;
    }
    loadConversation(activeId).catch((err) => setError(err.message));
  }, [activeId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    let cancelled = false;

    async function syncVisibleConversation() {
      if (
        cancelled ||
        loading ||
        streamingConversationIdRef.current ||
        typeof document === 'undefined' ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      try {
        const currentActiveId = activeIdRef.current;
        await refreshConversations({ keepActive: Boolean(currentActiveId) });
        if (currentActiveId && !cancelled) {
          await loadConversation(currentActiveId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    }

    const interval = window.setInterval(syncVisibleConversation, 3500);
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncVisibleConversation();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeId, loading]);

  async function createConversation() {
    requestSeqRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamingConversationIdRef.current = null;
    setLoading(false);
    updateActiveId(null);
    setActiveConversation(null);
    setMobileOpen(false);
  }

  async function sendChatRequest({
    conversationId,
    files = [],
    images = [],
    message,
    model,
    signal,
    webSearchEnabled: searchEnabled = false,
  }) {
    const body = { message, model, webSearchEnabled: Boolean(searchEnabled) };
    if (conversationId) {
      body.conversationId = conversationId;
    }
    if (images.length > 0) {
      body.images = images;
    }
    if (files.length > 0) {
      body.files = files;
    }
    return fetch('/.netlify/functions/chat-stream', {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify(body),
    });
  }

  async function sendMessage(message, model = selectedModel) {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setLoading(true);
    setError('');
    setNotice('');
    setComposerValue('');
    const abortController = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = abortController;
    const imagesForRequest = composerImages;
    const filesForRequest = composerFiles;
    setComposerImages([]);
    setComposerFiles([]);
    const attachmentNotes = [
      imagesForRequest.length > 0 ? `[已上传 ${imagesForRequest.length} 张图片]` : '',
      filesForRequest.length > 0 ? `[已上传 ${filesForRequest.length} 个文件]` : '',
    ].filter(Boolean);
    const optimistic = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: attachmentNotes.length > 0 ? [message, ...attachmentNotes].filter(Boolean).join('\n') : message,
      createdAt: new Date().toISOString(),
    };
    const streamingAssistant = {
      id: `streaming-${Date.now()}`,
      role: 'assistant',
      content: '',
      reasoning: null,
      reasoningOpen: false,
      visualStatus: imagesForRequest.length > 0 ? '图片识别中' : null,
      model,
      createdAt: new Date().toISOString(),
    };
    const targetId = activeConversation?.id === activeId ? activeId : null;
    setActiveConversation((current) => ({
      ...(current ?? { id: targetId, title: '新的聊天', messages: [] }),
      messages: [...(current?.messages ?? []), optimistic, streamingAssistant],
    }));

    try {
      let finalPayload = null;
      async function readStreamingResponse(response, assistantId) {
        await readStreamingChat(response, {
          meta: ({ conversationId, title }) => {
            if (requestSeqRef.current !== requestSeq) return;
            streamingConversationIdRef.current = conversationId;
            updateActiveId(conversationId);
            setActiveConversation((current) => ({
              ...(current ?? { id: conversationId, title, messages: [] }),
              id: conversationId,
              title: current?.title || title || '新的聊天',
            }));
          },
          content: ({ delta }) => {
            if (requestSeqRef.current !== requestSeq) return;
            setActiveConversation((current) => updateStreamingMessage(current, assistantId, { contentDelta: delta }));
          },
          reasoning: ({ delta }) => {
            if (requestSeqRef.current !== requestSeq) return;
            setActiveConversation((current) => updateStreamingMessage(current, assistantId, { reasoningDelta: delta }));
          },
          done: (payload) => {
            if (requestSeqRef.current !== requestSeq) return;
            finalPayload = {
              ...payload,
              conversation: {
                ...payload.conversation,
                messages: payload.conversation.messages.map((item) => ({
                  ...item,
                  reasoningOpen: false,
                  visualStatus: null,
                })),
              },
            };
            recentlyCompletedConversationIdRef.current = payload.conversation.id;
            streamingConversationIdRef.current = null;
          },
          error: ({ error }) => {
            throw new Error(error);
          },
        });
      }

      try {
        const response = await sendChatRequest({
          conversationId: targetId,
          files: filesForRequest,
          images: imagesForRequest,
          message,
          model,
          signal: abortController.signal,
          webSearchEnabled,
        });
        await readStreamingResponse(response, streamingAssistant.id);
      } catch (err) {
        if (requestSeqRef.current !== requestSeq) return;
        if (targetId && (err.status === 404 || err.message === 'Conversation not found')) {
          await recoverMissingConversation({ silent: true });
          setActiveConversation({
            id: null,
            title: '新的聊天',
            messages: [optimistic, streamingAssistant],
          });
          const response = await sendChatRequest({
            conversationId: null,
            files: filesForRequest,
            images: imagesForRequest,
            message,
            model,
            signal: abortController.signal,
            webSearchEnabled,
          });
          await readStreamingResponse(response, streamingAssistant.id);
        } else {
          throw err;
        }
      }
      if (finalPayload) {
        if (requestSeqRef.current !== requestSeq) return;
        streamingConversationIdRef.current = null;
        setConversations(
          finalPayload.conversations.filter(
            (conversation) => !deletedConversationIdsRef.current.has(conversation.id),
          ),
        );
        updateActiveId(finalPayload.conversation.id);
        setActiveConversation(finalPayload.conversation);
      }
    } catch (err) {
      if (requestSeqRef.current !== requestSeq) return;
      if (err.name === 'AbortError') {
        setNotice('已停止生成');
        setTimeout(() => setNotice(''), 1600);
        return;
      }
      if (err.status === 404 || err.message === 'Conversation not found') {
        await recoverMissingConversation();
      } else {
        setError(err.message);
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        streamingConversationIdRef.current = null;
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        setLoading(false);
      }
    }
  }

  function stopGeneration() {
    requestSeqRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamingConversationIdRef.current = null;
    setLoading(false);
    setNotice('已停止生成');
    setTimeout(() => setNotice(''), 1600);
  }

  function regenerateLastAnswer() {
    if (loading) return;
    const lastUserMessage = [...activeMessages].reverse().find((message) => message.role === 'user');
    const content = String(lastUserMessage?.content ?? '')
      .replace(/\n?\[已上传 \d+ 张图片\]/g, '')
      .replace(/\n?\[已上传 \d+ 个文件\]/g, '')
      .trim();
    if (content) {
      sendMessage(content, selectedModel);
    }
  }

  async function copyMessage(content) {
    try {
      await copyText(content);
      setNotice('已复制');
      setTimeout(() => setNotice(''), 1600);
    } catch {
      setError('复制失败，请手动选中文字复制。');
    }
  }

  function editMessage(content) {
    setComposerValue(content);
  }

  async function confirmRename() {
    if (!dialog || dialog.type !== 'rename') return;
    const { conversation } = dialog;
    const title = dialog.value.trim();
    if (!title || title === conversation.title) {
      setDialog(null);
      return;
    }
    try {
      const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setActiveConversation((current) => (current?.id === conversation.id ? payload.conversation : current));
      setConversations((current) => current.map((item) => (item.id === conversation.id ? payload.conversation : item)));
      setDialog(null);
    } catch (err) {
      if (err.status === 404 || err.message === 'Conversation not found') {
        setDialog(null);
        await recoverMissingConversation();
      } else {
        setError(err.message);
      }
    }
  }

  async function togglePin(conversation) {
    try {
      const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !conversation.pinned }),
      });
      setActiveConversation((current) => (current?.id === conversation.id ? payload.conversation : current));
      setConversations((current) => current.map((item) => (item.id === conversation.id ? payload.conversation : item)));
    } catch (err) {
      if (err.status === 404 || err.message === 'Conversation not found') {
        await recoverMissingConversation();
      } else {
        setError(err.message);
      }
    }
  }

  async function confirmDelete() {
    if (!dialog || dialog.type !== 'delete') return;
    const { conversation } = dialog;
    try {
      await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
        method: 'DELETE',
      });
      deletedConversationIdsRef.current.add(conversation.id);
      const nextConversations = conversations.filter((item) => item.id !== conversation.id);
      setDialog(null);
      setConversations(nextConversations);
      if (activeId === conversation.id) {
        requestSeqRef.current += 1;
        streamingConversationIdRef.current = null;
        setLoading(false);
        updateActiveId(null);
        setActiveConversation(null);
      }
    } catch (err) {
      setDialog(null);
      if (err.status === 404 || err.message === 'Conversation not found') {
        await recoverMissingConversation();
      } else {
        setError(err.message);
      }
    }
  }

  async function logout() {
    await api('/.netlify/functions/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  }

  return (
    <main className={`chat-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <Sidebar
        activeId={activeId}
        conversations={conversations}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onCreate={createConversation}
        onDelete={(conversation) => setDialog({ type: 'delete', conversation })}
        onLogout={logout}
        onPin={togglePin}
        onRename={(conversation) => setDialog({ type: 'rename', conversation, value: conversation.title })}
        onSelect={(id) => {
          updateActiveId(id);
          setMobileOpen(false);
        }}
        sidebarOpen={sidebarOpen}
      />
      {mobileOpen && <button aria-label="关闭遮罩" className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}
      <section className="chat-area">
        <header className="chat-header">
          <div className="header-left">
            <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} type="button">
              <Menu size={19} />
            </button>
            <button className="icon-button desktop-only" onClick={() => setSidebarOpen((value) => !value)} type="button">
              <PanelLeftClose size={19} />
            </button>
            <div>
              <p>Hi, {session.username}</p>
              <h1>{activeTitle}</h1>
            </div>
          </div>
          <button className="ghost-button" onClick={createConversation} type="button">
            <Plus size={17} />
            新聊天
          </button>
        </header>
        {error && (
          <div className="toast" role="alert">
            {error}
            <button aria-label="关闭错误" onClick={() => setError('')} type="button">
              <X size={14} />
            </button>
          </div>
        )}
        {notice && <div className="toast notice" role="status">{notice}</div>}
        <MessageList
          forceScrollSignal={composerFocusScrollSignal}
          keyboardScrollSignal={viewportSignal}
          loading={loading}
          messages={activeMessages}
          onCopy={copyMessage}
          onEdit={editMessage}
        />
        <div className="composer-wrap" ref={composerWrapRef}>
          <Composer
            canRegenerate={activeMessages.some((message) => message.role === 'user')}
            canStop={loading}
            disabled={loading}
            files={composerFiles}
            images={composerImages}
            model={selectedModel}
            onChange={setComposerValue}
            onFileAdd={(files) => setComposerFiles((current) => [...current, ...files].slice(0, 4))}
            onFileRemove={(index) => setComposerFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            onFocus={() => setComposerFocusScrollSignal((value) => value + 1)}
            onImageAdd={(images) => setComposerImages((current) => [...current, ...images].slice(0, 4))}
            onImageRemove={(index) => setComposerImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            onModelChange={setSelectedModel}
            onRegenerate={regenerateLastAnswer}
            onSearchToggle={setWebSearchEnabled}
            onSend={sendMessage}
            onStop={stopGeneration}
            value={composerValue}
            webSearchEnabled={webSearchEnabled}
          />
          <p>支持 Markdown 渲染。内容由 DeepSeek 生成，请重要信息自行核对。</p>
        </div>
      </section>
      <Dialog
        dialog={dialog}
        onCancel={() => setDialog(null)}
        onConfirm={dialog?.type === 'rename' ? confirmRename : confirmDelete}
        onRenameValueChange={(value) => setDialog((current) => ({ ...current, value }))}
      />
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api('/.netlify/functions/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <main className="loading-page">
        <Sparkles size={26} />
      </main>
    );
  }

  return session ? <ChatApp onLogout={() => setSession(null)} session={session} /> : <LoginScreen onLogin={setSession} />;
}
