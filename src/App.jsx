import {
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  MoreVertical,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useEffect, useMemo, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
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
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
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
          <button
            className={`conversation-row ${conversation.id === activeId ? 'active' : ''}`}
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            type="button"
          >
            <span className="conversation-title">
              {conversation.pinned && <Pin size={13} />}
              {conversation.title}
            </span>
            <span className="conversation-time">{formatTime(conversation.updatedAt)}</span>
            <ConversationActions
              conversation={conversation}
              onDelete={onDelete}
              onPin={onPin}
              onRename={onRename}
            />
          </button>
        ))}
      </nav>
      <button className="logout-button" onClick={onLogout} type="button">
        <LogOut size={16} />
        退出
      </button>
    </aside>
  );
}

function MessageList({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
    <div className="messages">
      {messages.map((message) => (
        <article className={`message ${message.role}`} key={message.id ?? `${message.role}-${message.createdAt}`}>
          <div className="message-avatar">{message.role === 'user' ? 'R' : <Sparkles size={16} />}</div>
          <div className="message-bubble">
            <MarkdownMessage content={message.content} />
          </div>
        </article>
      ))}
      {loading && (
        <article className="message assistant">
          <div className="message-avatar">
            <Sparkles size={16} />
          </div>
          <div className="message-bubble typing">正在思考</div>
        </article>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function Composer({ disabled, onSend }) {
  const [value, setValue] = useState('');

  function submit(event) {
    event.preventDefault();
    const message = value.trim();
    if (!message || disabled) return;
    setValue('');
    onSend(message);
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(event);
          }
        }}
        placeholder="发消息给 rainbowseek..."
        rows={1}
        value={value}
      />
      <button aria-label="发送" className="send-button" disabled={disabled || !value.trim()} type="submit">
        <Send size={18} />
      </button>
    </form>
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

  const activeMessages = activeConversation?.messages ?? [];
  const activeTitle = useMemo(() => activeConversation?.title || '新的聊天', [activeConversation]);

  async function refreshConversations(nextActiveId = activeId) {
    const payload = await api('/.netlify/functions/conversations');
    setConversations(payload.conversations);
    if (!nextActiveId && payload.conversations[0]) {
      setActiveId(payload.conversations[0].id);
    }
  }

  async function loadConversation(id) {
    if (!id) {
      setActiveConversation(null);
      return;
    }
    const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(id)}`);
    setActiveConversation(payload.conversation);
  }

  useEffect(() => {
    refreshConversations().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadConversation(activeId).catch((err) => setError(err.message));
  }, [activeId]);

  async function createConversation() {
    setActiveId(null);
    setActiveConversation(null);
    setMobileOpen(false);
  }

  async function sendMessage(message) {
    setLoading(true);
    setError('');
    const optimistic = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setActiveConversation((current) => ({
      ...(current ?? { id: activeId, title: '新的聊天', messages: [] }),
      messages: [...(current?.messages ?? []), optimistic],
    }));

    try {
      const payload = await api('/.netlify/functions/chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId: activeId, message }),
      });
      setConversations(payload.conversations);
      setActiveId(payload.conversation.id);
      setActiveConversation(payload.conversation);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function renameConversation(conversation) {
    const title = window.prompt('新的聊天名称', conversation.title);
    if (!title || title.trim() === conversation.title) return;
    const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    setActiveConversation((current) => (current?.id === conversation.id ? payload.conversation : current));
    await refreshConversations(conversation.id);
  }

  async function togglePin(conversation) {
    const payload = await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !conversation.pinned }),
    });
    setActiveConversation((current) => (current?.id === conversation.id ? payload.conversation : current));
    await refreshConversations(conversation.id);
  }

  async function deleteConversation(conversation) {
    if (!window.confirm(`删除「${conversation.title}」？`)) return;
    await api(`/.netlify/functions/conversation?id=${encodeURIComponent(conversation.id)}`, {
      method: 'DELETE',
    });
    setConversations((items) => items.filter((item) => item.id !== conversation.id));
    if (activeId === conversation.id) {
      setActiveId(null);
      setActiveConversation(null);
    }
  }

  async function logout() {
    await api('/.netlify/functions/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  }

  return (
    <main className="chat-shell">
      <Sidebar
        activeId={activeId}
        conversations={conversations}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onCreate={createConversation}
        onDelete={deleteConversation}
        onLogout={logout}
        onPin={togglePin}
        onRename={renameConversation}
        onSelect={(id) => {
          setActiveId(id);
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
        <MessageList loading={loading} messages={activeMessages} />
        <div className="composer-wrap">
          <Composer disabled={loading} onSend={sendMessage} />
          <p>支持 Markdown 渲染。内容由 DeepSeek 生成，请重要信息自行核对。</p>
        </div>
      </section>
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
