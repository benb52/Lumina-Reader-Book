import React, { useState, useEffect, useRef } from 'react';
import { Users, MessageCircle, Hash, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  room: string;
  createdAt: any;
}

const ROOMS = [
  { id: 'general', name: 'General Discussion' },
  { id: 'scifi', name: 'Sci-Fi & Fantasy' },
  { id: 'nonfiction', name: 'Non-Fiction & Biographies' },
  { id: 'mystery', name: 'Mystery & Thriller' },
];

export default function BookClub() {
  const user = useStore((state) => state.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeRoom, setActiveRoom] = useState(ROOMS[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'bookclub_messages'), 
      where('room', '==', activeRoom)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      
      // Sort messages by createdAt on the client side to avoid needing a composite index
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeA - timeB;
      });

      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (error: any) => {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Cannot load messages.");
        setErrorMessage("Cannot load messages. Permission denied.");
      } else {
        console.error("Error getting messages:", error);
      }
    });

    return () => unsubscribe();
  }, [activeRoom]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    setErrorMessage(null);

    try {
      await addDoc(collection(db, 'bookclub_messages'), {
        text: newMessage,
        userId: user.uid,
        userName: user.name,
        room: activeRoom,
        createdAt: serverTimestamp(),
      });
      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.code === 'permission-denied') {
        setErrorMessage("You don't have permission to send messages.");
      } else {
        setErrorMessage("Failed to send message.");
      }
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto h-[calc(100vh-4rem)] md:h-screen flex flex-col relative">
      {errorMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-lg min-w-[300px]">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 ml-4">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 md:mb-6 shrink-0">
        <div className="bg-blue-100 text-blue-600 p-2 md:p-3 rounded-2xl">
          <Users size={24} />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Book Club</h1>
          <p className="text-sm md:text-base text-zinc-500 mt-1 hidden sm:block">Discuss your favorite books with the community.</p>
        </div>
      </div>

      <div className="flex-1 bg-white border border-zinc-200 rounded-2xl md:rounded-3xl shadow-sm flex overflow-hidden relative">
        
        {/* Mobile Sidebar Toggle */}
        <div className="md:hidden absolute top-4 right-4 z-20">
          <Button variant="outline" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>

        {/* Sidebar Rooms */}
        <div className={cn(
          "absolute md:static inset-y-0 left-0 w-64 border-r border-zinc-200 bg-zinc-50/95 backdrop-blur-md p-4 flex flex-col gap-2 z-10 transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-2 mt-12 md:mt-0">Channels</h3>
          {ROOMS.map(room => (
            <button
              key={room.id}
              onClick={() => {
                setActiveRoom(room.id);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                activeRoom === room.id 
                  ? "bg-white text-zinc-900 shadow-sm border border-zinc-200/60" 
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              <Hash size={16} className={activeRoom === room.id ? "text-blue-500" : "text-zinc-400"} />
              {room.name}
            </button>
          ))}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 border-b border-zinc-200 bg-white shrink-0 flex items-center gap-2">
            <Hash size={20} className="text-zinc-400" />
            <h2 className="font-semibold text-zinc-900">{ROOMS.find(r => r.id === activeRoom)?.name}</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <MessageCircle size={48} className="mb-4 opacity-20" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.userId === user?.uid;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-zinc-400 mb-1 ml-1">{msg.userName}</span>
                    <div 
                      className={`px-4 py-2.5 rounded-2xl max-w-[85%] md:max-w-[80%] ${
                        isMe 
                          ? 'bg-zinc-900 text-white rounded-tr-sm' 
                          : 'bg-zinc-100 text-zinc-900 rounded-tl-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="p-3 md:p-4 bg-zinc-50 border-t border-zinc-200 shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message #${ROOMS.find(r => r.id === activeRoom)?.name.toLowerCase()}...`}
                className="flex-1 px-4 py-2 md:py-2.5 text-sm md:text-base rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
              <Button type="submit" disabled={!newMessage.trim()}>
                Send
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
