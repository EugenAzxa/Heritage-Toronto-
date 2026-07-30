/* ============================================================
   Albert Jackson  |  Heritage Toronto tribute
   Scroll reveals, progress, lightbox, and the
   "Speak with Albert" conversation engine.
   ============================================================ */

(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header state + scroll progress ---------- */
  const header = document.getElementById("siteHeader");
  const progressBar = document.getElementById("progressBar");

  function onScroll() {
    const y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("scrolled", y > 40);
    if (progressBar) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Gallery lightbox ---------- */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxCap = document.getElementById("lightboxCap");
  const lightboxClose = document.getElementById("lightboxClose");
  let lastFocused = null;

  function openLightbox(src, cap, alt) {
    lastFocused = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightboxCap.textContent = cap || "";
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  }
  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.src = "";
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }
  document.querySelectorAll(".gallery-item").forEach((fig) => {
    const img = fig.querySelector("img");
    fig.addEventListener("click", () =>
      openLightbox(fig.dataset.full, fig.dataset.caption, img ? img.alt : "")
    );
  });
  if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
  if (lightbox)
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
  });

  /* ============================================================
     SPEAK WITH ALBERT  -  conversation engine
     First-person answers grounded in the documented record.
     No em dashes in copy, by house style.
     ============================================================ */

  const PORTRAIT = "assets/portrait-1882.jpg";

  // Each topic: id, matching keywords, an array of possible replies,
  // and follow-up suggestion ids to offer after answering.
  const KB = [
    {
      id: "birth",
      keys: ["born", "birth", "slave", "slavery", "delaware", "childhood as a slave", "where were you born", "early", "beginning"],
      replies: [
        "I was born in Delaware, in the late 1850s, and I was born a slave. That is the plain fact of it. My earliest inheritance was not land or a name of standing, it was bondage. What I had instead was a mother who decided her children would not spend their lives that way."
      ],
      follow: ["mother", "toronto", "carrier"]
    },
    {
      id: "mother",
      keys: ["mother", "ann maria", "escape", "underground railroad", "railroad", "north", "flee", "fled", "freedom", "brothers", "sold", "father", "family before"],
      replies: [
        "My mother was Ann Maria Jackson, and she was the bravest soul I ever knew. Two of my brothers were taken from her and sold, and my father did not survive the grief of it. So she gathered the rest of us, seven children, and with the help of the Underground Railroad she carried us out of the United States. In 1858 we reached Toronto. I was only a toddler. I do not remember the journey, but I have spent my life remembering what it bought me.",
        "Everything I am began with my mother's courage. Ann Maria Jackson would not let her children be owned. After losing two sons to a sale and her husband to sorrow, she fled north on the Underground Railroad with seven of us in 1858. Toronto was where the road ended and a free life began."
      ],
      follow: ["toronto", "birth", "carrier"]
    },
    {
      id: "toronto",
      keys: ["toronto", "grow up", "grew up", "st john", "ward", "neighbourhood", "neighborhood", "school", "educated", "canada", "settle", "where did you live", "home"],
      replies: [
        "We settled in St. John's Ward, right in the heart of Toronto. The Ward was home to a great many people who had come north before the war, folks who knew what it was to start over with nothing but their freedom. I grew up there and I was schooled there. It made me a Torontonian, and I have been one ever since.",
        "Toronto raised me. My family made its home in St. John's Ward downtown, among others who had travelled the same road to freedom. I grew up an ordinary boy of this city, and later I would come to know its streets better than most, one letter at a time."
      ],
      follow: ["carrier", "family", "route"]
    },
    {
      id: "carrier",
      keys: ["carrier", "letter carrier", "postman", "mailman", "appoint", "job", "hired", "post office", "1882", "position", "civil servant", "become", "first black"],
      replies: [
        "On the twelfth of May, 1882, I was appointed a letter carrier for the Toronto Post Office. Understand what that meant. A civil service post, a steady and respected position, given to a Black man in Canada in those years. It was almost unheard of. I had earned it, and for one bright moment it was mine.",
        "I became a letter carrier on May 12th, 1882. To be a Black man appointed to the civil service then was a rare thing indeed. I was proud. I did not yet know that the trouble was only beginning."
      ],
      follow: ["refused", "route", "toronto"]
    },
    {
      id: "refused",
      keys: ["refuse", "refused", "train", "training", "porter", "hall porter", "discrimination", "racism", "racist", "colleagues", "colleagues", "coworkers", "white workers", "trouble", "problem", "hardest", "difficult", "demoted", "indoor"],
      replies: [
        "The other carriers would not train me. That was how they meant to stop me. A route must be learned from a man who walks it, and not one of them would teach a Black man his. So my supervisor set me aside to an indoor job, a hall porter, and just like that the position I had won was being taken from me without a word of my own conduct against it. It was not my work they objected to. It was my colour.",
        "They refused to teach me my route. The white carriers turned their backs, and rather than stand up for me, my supervisor tucked me away indoors as a hall porter. It stung more than I can say. I had done nothing wrong except to be a Black man who wanted to do his job."
      ],
      follow: ["community", "macdonald", "route"]
    },
    {
      id: "community",
      keys: ["community", "stood up", "help", "support", "meeting", "committee", "petition", "press", "newspaper", "debate", "protest", "advocate", "fight", "people", "who helped"],
      replies: [
        "I did not fight alone. That is the part I want remembered. Toronto's Black community would not stand for it. They called a public meeting, they formed a committee to speak for me, and they took the matter into the newspapers. A heated debate ran across the city's press over whether one man might carry the mail. The whole town was made to look at the question and answer it.",
        "My neighbours rose up on my behalf. The Black community of Toronto organized, held a public meeting, made a committee, and pressed my case in the papers until the whole city was arguing about it. When people ask me how I got my route back, I tell them plainly: my community would not let me be pushed aside."
      ],
      follow: ["macdonald", "refused", "route"]
    },
    {
      id: "macdonald",
      keys: ["macdonald", "prime minister", "john a", "politician", "government", "reinstate", "reinstated", "back", "returned", "election", "vote", "voters", "june"],
      replies: [
        "The matter reached as high as the Prime Minister. Sir John A. Macdonald came out in my support. I will be honest with you about it: there was an election near, and Black votes were worth courting. But whatever moved him, the pressure told. On the second of June, 1882, I began my training at last. I would walk my route after all.",
        "With the city in an uproar and an election coming, Sir John A. Macdonald lent his voice for me. He was courting Black voters, mind you, so I hold no illusions about it being pure charity. Still, it worked. On June 2nd, 1882, I started my training and took up the route that was rightfully mine."
      ],
      follow: ["route", "community", "family"]
    },
    {
      id: "route",
      keys: ["route", "work", "deliver", "delivery", "mail", "day", "walk", "36 years", "thirty-six", "years", "career", "daily", "streets", "what was it like"],
      replies: [
        "For thirty-six years I carried the mail through the streets of Toronto, my rounds taking me through Harbord Village and the Annex, until my death in 1918. Rain, snow, summer heat, it did not matter. I picked up my letters at the General Post Office and I walked them to the doors of this city. There is a quiet dignity in that work, in being the man a whole neighbourhood trusts to bring the word from far away. I never took it for granted, not one day of it.",
        "My route was my life for thirty-six years. Every morning to the post office, then out among the houses with my bag. People came to know me and I came to know them. After all the fuss over whether a Black man could do the work, I simply did it, faithfully, until 1918."
      ],
      follow: ["family", "legacy", "advice"]
    },
    {
      id: "family",
      keys: ["family", "wife", "married", "marriage", "henrietta", "jones", "children", "sons", "kids", "father of", "raise"],
      replies: [
        "In 1883 I married Henrietta Elizabeth Jones, a Toronto woman, and together we raised four sons. A home, a wife, boys of my own to bring up free in a free city. For a man who began life as another man's property, I tell you there is no wealth in the world to match it.",
        "I married Henrietta Elizabeth Jones in 1883 and we had four sons. Family was the whole point of my mother's long road north, after all. She ran so that her children and her children's children might belong to themselves. My boys were the proof that she succeeded."
      ],
      follow: ["mother", "route", "legacy"]
    },
    {
      id: "legacy",
      keys: ["legacy", "remember", "remembered", "stamp", "laneway", "lane", "plaque", "honour", "honor", "today", "now", "history", "proud of", "commemorate"],
      replies: [
        "They tell me the city has not forgotten. A plaque stands where the old post office was, so people passing know my name. A laneway carries it too. And in 2019 my face went out across the whole country on a postage stamp, which I find a fine joke and a fine honour both, a letter carrier riding on the letters. I am glad of it, though I hope folks remember it was never only about me. It was about what a city is willing to stand up for.",
        "I am told I am remembered now, with a plaque, a laneway that bears my name, and a national stamp in 2019. It moves me more than I can say. But if you take one thing from my story, let it not be my face on a stamp. Let it be that ordinary people organized, spoke up, and would not let an injustice stand."
      ],
      follow: ["advice", "route", "community"]
    },
    {
      id: "advice",
      keys: ["advice", "learn", "lesson", "meaning", "message", "young people", "teach", "kept you going", "hope", "why", "believe", "faith", "endure"],
      replies: [
        "If I may leave you with something, it is this. What was done to me was wrong, but I did not win my route back by bitterness. I won it because good people refused to look away, and because I kept showing up to do honest work. Stand up for the person being pushed aside. Do your work well. And never let anyone tell you where your place ends.",
        "What kept me going? The memory of my mother on that long road, and the neighbours who fought for me when I could not fight alone. My advice is simple. Be the one who speaks up. Be the one who trains the newcomer no one else will teach. That is how a city becomes worthy of its people."
      ],
      follow: ["mother", "community", "legacy"]
    },
    {
      id: "greeting",
      keys: ["hello", "hi", "hey", "good day", "greetings", "who are you", "your name", "introduce", "morning", "afternoon"],
      replies: [
        "Good day to you. Albert Jackson, letter carrier of the Toronto Post Office. Pull up a chair. Ask me whatever you like, about the road my mother took, about the day they tried to keep me off my route, or about the city that would not let them. I am glad of the company."
      ],
      follow: ["mother", "carrier", "refused"]
    },
    {
      id: "thanks",
      keys: ["thank", "thanks", "appreciate", "grateful", "goodbye", "bye", "farewell"],
      replies: [
        "You are most welcome. It does an old carrier good to know his story is still being read. Mind how you go, and remember to stand up for the next fellow they try to push aside."
      ],
      follow: ["advice", "legacy"]
    }
  ];

  // Human-readable labels for the suggestion chips.
  const LABELS = {
    birth: "Where were you born?",
    mother: "Tell me about your mother's escape",
    toronto: "What was growing up in Toronto like?",
    carrier: "How did you become a letter carrier?",
    refused: "What happened when you started?",
    community: "Who stood up for you?",
    macdonald: "Did the Prime Minister help you?",
    route: "What was the work like?",
    family: "Did you have a family?",
    legacy: "How are you remembered today?",
    advice: "What should we learn from your story?"
  };

  const FALLBACKS = [
    "That I cannot rightly answer, for my life left only so much of a record behind. But ask me about my mother's escape, the day my route was taken from me, or how the city won it back, and I will tell you gladly.",
    "You have me there. History did not keep a note of that. Still, there is plenty I can tell you: about coming north as a child, about becoming a letter carrier in 1882, or about the neighbours who fought for me. What would you like to know?",
    "I am not certain I can speak to that. What I know well is my own road: born a slave in Delaware, carried to Toronto by my mother, and made the first Black letter carrier in this city. Ask me of that and I will not run short of words."
  ];

  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatField = document.getElementById("chatField");
  const chatSuggests = document.getElementById("chatSuggests");
  const chatReset = document.getElementById("chatReset");

  // deterministic-ish pick without Math.random reliance issues
  let pickSeed = 7;
  function pick(arr) {
    pickSeed = (pickSeed * 33 + 17) % 100000;
    return arr[pickSeed % arr.length];
  }

  function matchTopic(text) {
    const t = " " + text.toLowerCase().replace(/[^a-z0-9\s]/g, " ") + " ";
    let best = null;
    let bestScore = 0;
    KB.forEach((topic) => {
      let score = 0;
      topic.keys.forEach((k) => {
        if (t.indexOf(" " + k + " ") !== -1) score += k.split(" ").length * 2;
        else if (t.indexOf(k) !== -1) score += 1;
      });
      if (score > bestScore) {
        bestScore = score;
        best = topic;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function addMessage(who, html) {
    const msg = document.createElement("div");
    msg.className = "msg " + who;

    const avatar = document.createElement("span");
    avatar.className = "msg-avatar";
    if (who === "albert") {
      const img = document.createElement("img");
      img.src = PORTRAIT;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      avatar.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = html;

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
    return { msg, bubble };
  }

  function showTyping() {
    const { msg, bubble } = addMessage("albert", "");
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    return msg;
  }

  function renderSuggests(ids) {
    chatSuggests.innerHTML = "";
    ids.forEach((id) => {
      if (!LABELS[id]) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggest";
      b.textContent = LABELS[id];
      b.addEventListener("click", () => handleUser(LABELS[id], id));
      chatSuggests.appendChild(b);
    });
  }

  function albertRespond(topic, userText) {
    const typing = showTyping();
    const reply = topic ? pick(topic.replies) : pick(FALLBACKS);
    const delay = prefersReduced ? 200 : Math.min(1500, 500 + reply.length * 6);
    setTimeout(() => {
      typing.remove();
      addMessage("albert", reply);
      if (topic && topic.follow) renderSuggests(topic.follow);
      else renderSuggests(["mother", "refused", "community", "legacy"]);
    }, delay);
  }

  function handleUser(text, forcedTopicId) {
    const clean = text.trim();
    if (!clean) return;
    addMessage("user", escapeHtml(clean));
    chatField.value = "";
    let topic = null;
    if (forcedTopicId) topic = KB.find((k) => k.id === forcedTopicId) || null;
    if (!topic) topic = matchTopic(clean);
    albertRespond(topic, clean);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function greet() {
    chatLog.innerHTML = "";
    const intro = KB.find((k) => k.id === "greeting");
    addMessage("albert", intro.replies[0]);
    renderSuggests(["mother", "carrier", "refused", "legacy"]);
  }

  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleUser(chatField.value);
    });
  }
  if (chatReset) chatReset.addEventListener("click", greet);
  if (chatLog) greet();
})();
