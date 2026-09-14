import { getCatalog } from "@/lib/catalog";
import { siteUrl } from "@/lib/site";
import { LEGAL_LINKS, MERCHANT } from "@/lib/legal";

const styles = [
  {
    name: "POP",
    key: "pop",
    subtitle: "Vinyl collectible",
    copy: "Vinyl визия с по-голяма глава и силен колекционерски характер.",
    image: "/marketing/pop-card.svg",
    tone: "coral",
    badge: "КЛАСИКА",
  },
  {
    name: "MINI",
    key: "mini",
    subtitle: "Chibi figure",
    copy: "По-мек chibi силует, повече детайл и много характер.",
    image: "/marketing/mini.svg",
    tone: "blue",
    badge: "ДЕТАЙЛЕН",
  },
  {
    name: "BRICK",
    key: "brick",
    subtitle: "Brick-style figure",
    copy: "Геометрична brick-style версия — чиста, забавна и разпознаваема.",
    image: "/marketing/brick.svg",
    tone: "lime",
    badge: "МОДЕРЕН",
  },
];

const faqs = [
  ["Ще видя ли фигурката преди да платя?", "Да. Първо генерираме визуализация по твоята снимка. Плащаш едва след като я харесаш."],
  ["Каква снимка да кача?", "Най-добре работи ясна снимка с добро осветление, видимо лице и по възможност цял ръст."],
  ["Какви размери има?", "10 cm, 15 cm или 20 cm. Избираш размера след визуализацията."],
  ["Мога ли да генерирам отново?", "Да. Имаш до два допълнителни опита за същата снимка."],
  [
    "Колко време отнема?",
    `Изработка ${MERCHANT.productionDays} работни дни след плащане, плюс ${MERCHANT.deliveryDays} работни дни доставка с ${MERCHANT.courier}. Получаваш имейл с номер за проследяване, когато фигурката тръгне към теб.`,
  ],
  [
    "Мога ли да върна фигурката?",
    "Фигурката се изработва специално по твоята снимка, затова 14-дневното право на отказ за онлайн покупки не се прилага (чл. 57, т. 3 ЗЗП). Точно затова плащаш едва след като одобриш визуализацията. Ако пристигне повредена или с дефект, пиши ни до 14 дни — изработваме нова или връщаме сумата.",
  ],
  [
    "Какво става със снимката ми?",
    "Използва се за създаване на твоята фигурка чрез услугите, описани в Политиката за поверителност. Файловете по неплатени поръчки се трият след 7 дни, по платени — 90 дни след изпращането. Подробно в Политиката за поверителност.",
  ],
];

export default function Home() {
  const catalog = getCatalog();
  const origin = siteUrl();
  const product = { "@context": "https://schema.org", "@type": "Product", name: "POPME персонализирана 3D фигурка", description: "POP, MINI или BRICK фигурка по снимка, в размер 10, 15 или 20 cm.", brand: { "@type": "Brand", name: "POPME" }, offers: catalog.map((item) => ({ "@type": "Offer", name: `${item.size} cm`, price: item.price, priceCurrency: "EUR", url: `${origin}/create` })) };
  return (
    <main className="pmv2-site">
      {origin && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(product).replace(/</g, "\\u003c") }} />}
      <div className="pmv2-announcement">
        <strong>ВИЖДАШ ФИГУРКАТА СИ, ПРЕДИ ДА ПЛАТИШ</strong>
        <span>СТАРТОВИ ЦЕНИ ОТ €{catalog[0].price}</span>
      </div>

      <header className="pmv2-header" id="top">
        <a className="pmv2-logo" href="#top" aria-label="POPME начало">popme<span>✦</span></a>
        <nav className="pmv2-nav-links" aria-label="Основна навигация">
          <a href="#styles">Стилове</a>
          <a href="#how">Как работи</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="pmv2-header-actions">
          <a className="pmv2-header-cta" href="/create">СЪЗДАЙ ФИГУРКА</a>
          <a className="pmv2-menu-link" href="#styles" aria-label="Виж стиловете">☰</a>
        </div>
      </header>

      <section className="pmv2-hero">
        <div className="pmv2-hero-copy">
          <div className="pmv2-rating-line"><b>3</b> стила · <b>3</b> размера · preview <b>преди</b> плащане</div>
          <h1>Една снимка.<br /><span>Твоята фигурка.</span></h1>
          <p className="pmv2-hero-lead">Превръщаме твоя снимка в персонализирана POP, MINI или BRICK 3D колекционерска фигурка.</p>
          <div className="pmv2-hero-actions">
            <a className="pmv2-primary" href="/create">СЪЗДАЙ СВОЯТА ФИГУРКА →</a>
            <div className="pmv2-start-price"><span>СТАРТОВА ЦЕНА</span><strong>от €{catalog[0].price}</strong></div>
          </div>
          <div className="pmv2-micro-trust">
            <span>◷ Плащаш след одобрение</span>
            <span>◇ Сигурно онлайн плащане</span>
          </div>
        </div>

        <div className="pmv2-hero-stage" aria-label="POPME POP, MINI и BRICK стилове">
          <div className="pmv2-stage-glow" />
          <div className="pmv2-stage-shadow" />
          <a className="pmv2-figure pmv2-figure-pop" href="/create?style=pop">
            <img src="/marketing/pop-card.svg" alt="Примерна POP фигурка" />
            <b>POP</b>
          </a>
          <a className="pmv2-figure pmv2-figure-mini" href="/create?style=mini">
            <img src="/marketing/mini.svg" alt="Примерна MINI фигурка" />
            <b>MINI</b>
          </a>
          <a className="pmv2-figure pmv2-figure-brick" href="/create?style=brick">
            <img src="/marketing/brick.svg" alt="Примерна BRICK фигурка" />
            <b>BRICK</b>
          </a>
          <div className="pmv2-hero-badge">ВИЖДАШ Я<br />ПРЕДИ ДА<br />ПЛАТИШ</div>
        </div>
      </section>

      <section className="pmv2-trust-marquee" aria-label="Основни предимства">
        <span>PREVIEW ПРЕДИ ПЛАЩАНЕ</span>
        <span>3D ПЕЧАТ ПО ПОРЪЧКА</span>
        <span>ДО 2 НОВИ ОПИТА</span>
        <span>ПЕРСОНАЛИЗИРАНА ИЗРАБОТКА</span>
      </section>

      <section className="pmv2-styles" id="styles">
        <div className="pmv2-section-title">
          <p>НАМЕРИ СВОЯТА ВЕРСИЯ</p>
          <h2>Избери своя стил</h2>
        </div>
        <div className="pmv2-style-rail">
          {styles.map((style) => (
            <article className={`pmv2-style-card ${style.tone}`} key={style.key}>
              <div className="pmv2-style-visual">
                <span className="pmv2-style-badge">{style.badge}</span>
                <img src={style.image} alt={`${style.name} стил POPME фигурка`} />
              </div>
              <div className="pmv2-style-body">
                <div className="pmv2-style-heading"><div><h3>{style.name}</h3><small>{style.subtitle}</small></div><strong>от €{catalog[0].price}</strong></div>
                <p>{style.copy}</p>
                <div className="pmv2-size-chips"><span>10 cm</span><span>15 cm</span><span>20 cm</span></div>
                <a href={`/create?style=${style.key}`}>ИЗБЕРИ {style.name} →</a>
              </div>
            </article>
          ))}
        </div>
        <p className="pmv2-swipe-hint">ПЛЪЗНИ ЗА ОЩЕ →</p>
      </section>

      <section className="pmv2-how" id="how">
        <div className="pmv2-section-title compact"><p>КАК РАБОТИ</p><h2>Три стъпки. Толкова е.</h2></div>
        <div className="pmv2-how-list">
          <div><b>01</b><strong>Качи снимка</strong><span>JPG, PNG или WEBP · до 8 MB</span></div>
          <div><b>02</b><strong>Виж визуализация</strong><span>До 2 нови опита</span></div>
          <div><b>03</b><strong>Одобри и поръчай</strong><span>10 / 15 / 20 cm · сигурно онлайн плащане</span></div>
        </div>
      </section>

      <section className="pmv2-proof">
        <div className="pmv2-proof-inner">
          <div className="pmv2-proof-copy">
            <p>PREVIEW ПРЕДИ ПЛАЩАНЕ</p>
            <h2>Виж я. Харесай я.<br />После поръчай.</h2>
            <span>Не плащаш на сляпо. Първо получаваш визуализация по своята снимка — плащането идва след като я одобриш.</span>
            <a href="/create">НАПРАВИ МЕ 3D →</a>
          </div>
          <div className="pmv2-proof-flow" aria-label="Снимка към preview към фигурка">
            <figure><div className="pmv2-proof-placeholder"><span>ТВОЯТА<br />СНИМКА</span></div><figcaption>01 · СНИМКА</figcaption></figure>
            <figure><div className="pmv2-proof-preview"><img src="/marketing/mini.svg" alt="Примерна MINI визуализация" /></div><figcaption>02 · PREVIEW</figcaption></figure>
            <figure><div className="pmv2-proof-product"><img src="/marketing/pop-card.svg" alt="Примерна готова фигурка" /></div><figcaption>03 · POPME</figcaption></figure>
          </div>
        </div>
      </section>

      <section className="pmv2-faq" id="faq">
        <div className="pmv2-section-title compact"><p>НАЙ-ВАЖНОТО</p><h2>Преди да започнеш</h2></div>
        <div className="pmv2-faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<span>+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pmv2-final">
        <div><p>ГОТОВ ЛИ СИ?</p><h2>Една снимка.<br />Твоята фигурка.</h2></div>
        <div className="pmv2-final-action"><strong>от €{catalog[0].price}</strong><a href="/create">СЪЗДАЙ СВОЯТА →</a></div>
      </section>

      <footer className="pmv2-footer">
        <a className="pmv2-logo" href="#top">popme<span>✦</span></a>
        <div className="pmv2-footer-legal">
          <p>Персонализирани 3D колекционерски фигурки · Made of you.</p>
          <nav aria-label="Правна информация">
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
            <a href={`mailto:${MERCHANT.email}`}>Контакт</a>
          </nav>
          <address>
            {MERCHANT.legalName} · ЕИК {MERCHANT.eik} · {MERCHANT.address} · {MERCHANT.email}
          </address>
        </div>
        <small>© 2026 {MERCHANT.brand}</small>
      </footer>

      <a className="pmv2-mobile-cta" href="/create"><span>СЪЗДАЙ ФИГУРКА</span><strong>от €{catalog[0].price} →</strong></a>
    </main>
  );
}
