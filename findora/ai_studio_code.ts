import React, { useState, useCallback, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

interface Product {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  productUrl: string;
}

interface Source {
  uri: string;
  title: string;
}

const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState<boolean>(false);

  // API Anahtarı Vite'ın .env dosyasından okunacak şekilde güncellendi
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string });

  const fetchProducts = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setProducts([]);
    setSources([]);
    setSearched(true);

    try {
      const prompt = `Sen uzman bir alışveriş asistanısın. Şu sorguyla eşleşen ürünleri bul: "${searchQuery}". Gerçek, güncel ürünleri bulmak için Google Araması'nı kullan. Sonuçları, "products" dizisi içeren bir JSON nesnesi olarak döndür. Dizideki her ürün nesnesi "name" (ürün adı), "description" (kısa açıklama), "price" (fiyat bilgisi), "imageUrl" (gerçek ve geçerli bir ürün görseli URL'si) ve "productUrl" (ürünün incelenebileceği gerçek bir web sayfası URL'si) alanlarına sahip olmalıdır. Her zaman gerçek ürün görselleri için URL'ler bulmaya çalış, yer tutucu kullanma. JSON yanıtı tek bir markdown kod bloğunun içine yerleştirilmelidir (\`\`\`json ... \`\`\`). Sadece JSON kod bloğunu döndür, başka bir metin ekleme.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
        const webSources = groundingMetadata.groundingChunks
          .map(chunk => chunk.web && chunk.web.uri ? { uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri } : null)
          .filter((source): source is Source => source !== null);

        const uniqueSources = Array.from(new Map(webSources.map(item => [item.uri, item])).values());
        setSources(uniqueSources);
      }

      let jsonText = response.text.trim();
      const match = jsonText.match(/```json\n([\s\S]*?)\n```/);
      if (match && match[1]) {
        jsonText = match[1];
      }

      try {
        const jsonResponse = JSON.parse(jsonText);
        setProducts(jsonResponse.products || []);
      } catch (parseError) {
        console.error("JSON parse error:", parseError, "Response was:", response.text);
        setError('Yanıtta bir hata oluştu. Model beklenen formatta veri göndermedi.');
        setProducts([]);
      }

    } catch (e) {
      console.error(e);
      setError('Ürünler alınırken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  }, [ai.models]);
  
  const handleTextSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchProducts(query);
  };

  const handleVoiceSearch = () => {
    if (!SpeechRecognition) {
      setError('Tarayıcınız ses tanımayı desteklemiyor.');
      return;
    }
    if (isListening || isLoading) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    setIsListening(true);
    setError(null);
    
    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript;
      setQuery(speechResult);
      fetchProducts(speechResult);
    };

    recognition.onspeechend = () => {
      recognition.stop();
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      setError(`Ses tanıma hatası: ${event.error}`);
      setIsListening(false);
    };
    
    recognition.start();
  };

  const renderStatus = () => {
    if (isLoading) {
      return <div className="loader" aria-label="Yükleniyor"></div>;
    }
    if (isListening) {
      return <p>Dinleniyor... Lütfen konuşun.</p>;
    }
    if (error) {
      return <p className="error-message">{error}</p>;
    }
    if (searched && !isLoading && products.length === 0) {
      return <p>Aradığınız kriterlere uygun ürün bulunamadı.</p>;
    }
    if (!searched) {
       return <p>Lütfen aramak istediğiniz ürünü yazın veya sesli arama yapın.</p>;
    }
    return null;
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Findora</h1>
        <svg
          className="header-icon"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z" />
          <path d="M21 21L15.8 15.8" />
          <path d="M10.5 7.5L9.8 9.05L8.25 9.75L9.8 10.45L10.5 12L11.2 10.45L12.75 9.75L11.2 9.05L10.5 7.5Z" />
        </svg>
        <p>Yapay zeka ile istediğiniz ürünü saniyeler içinde bulun.</p>
      </header>

      <form className="search-container" onSubmit={handleTextSearch}>
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Örn: 'kablosuz kulaklık'"
          aria-label="Ürün arama"
          disabled={isLoading || isListening}
        />
        <button type="submit" className="search-button" disabled={isLoading || isListening || !query.trim()}>
          <span className="material-icons">search</span>
          Ara
        </button>
        <button 
            type="button" 
            className={`search-button voice-button ${isListening ? 'listening' : ''}`}
            onClick={handleVoiceSearch} 
            disabled={isLoading}
            aria-label="Sesle arama yap"
        >
          <span className="material-icons">{isListening ? 'settings_voice' : 'mic'}</span>
          Sesli
        </button>
      </form>

      <div className="status-container">
        {renderStatus()}
      </div>

      {sources.length > 0 && (
        <div className="sources-container">
          <h4>Bilgi Kaynakları</h4>
          <ul>
            {sources.map((source, index) => (
              <li key={index}>
                <a href={source.uri} target="_blank" rel="noopener noreferrer" title={source.uri}>
                  {source.title.length > 50 ? `${source.title.substring(0, 47)}...` : source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {products.length > 0 && (
        <div className="results-grid">
          {products.map((product, index) => (
            <div key={index} className="product-card">
              <img 
                src={product.imageUrl} 
                alt={product.name} 
                className="product-image" 
                onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/300x200.png?text=Görsel+Yok'}
              />
              <div className="product-info">
                <h3 className="product-name">{product.name}</h3>
                <p className="product-description">{product.description}</p>
                <div className="product-footer">
                  <span className="product-price">{product.price}</span>
                  <a href={product.productUrl} className="product-link" target="_blank" rel="noopener noreferrer">İncele</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);