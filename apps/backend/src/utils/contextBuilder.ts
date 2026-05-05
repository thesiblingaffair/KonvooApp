/**
 * Real-Time Context Builder
 * 
 * Generates ambient context for Kavya based on time, season, 
 * festivals, and cultural moments. Zero API calls — all computed
 * from date/time.
 * 
 * DESIGN PRINCIPLE: Context is background music, not the main track.
 * It flavors the opening of a conversation, never interrupts one.
 */

// ─── TYPES ─────────────────────────────────────────────

interface RealtimeContext {
  timeOfDay: string;       // "morning", "afternoon", "evening", "late_night"
  dayType: string;         // "weekday_morning", "friday_evening", "lazy_sunday", etc.
  season: string | null;   // "monsoon", "peak_summer", "winter", etc.
  festival: string | null; // "Holi", "Diwali", etc. or null
  special: string | null;  // "IPL season", "exam season", etc.
  prompt: string;          // Final 2-3 line block for system prompt
}

// ─── FESTIVAL CALENDAR ─────────────────────────────────
// Approximate dates — some shift yearly (lunar calendar)
// Format: [month (1-indexed), startDay, endDay, name, kavyaFlavor]

const FESTIVALS_2026: Array<[number, number, number, string, string]> = [
  // January
  [1, 14, 14, "Makar Sankranti", "til ke laddu khaye? Mummy ne bheje mere liye"],
  [1, 26, 26, "Republic Day", "parade dekhi? Patriotic feel aa rahi hai aaj"],
  // February  
  [2, 14, 14, "Valentine's Day", "sab couples dikhe aaj... main toh Biscuit ke saath hai"],
  [2, 26, 26, "Maha Shivratri", "aaj Shivratri hai, mummy ne pooja ki"],
  // March
  [3, 14, 14, "Holi", "rang lagane mat aana mere white kurte pe 😂 Happy Holi!"],
  [3, 30, 31, "Ugadi / Gudi Padwa", "new year vibes for some of us!"],
  // April
  [4, 2, 2, "Ram Navami", "aaj Ram Navami hai, ghar pe pooja ho rahi"],
  [4, 6, 6, "Mahavir Jayanti", ""],
  [4, 10, 14, "Baisakhi / Tamil New Year", "harvest festival energy!"],
  [4, 14, 14, "Ambedkar Jayanti", ""],
  // May
  [5, 1, 1, "May Day", "workers' day — but mera kaam toh kabhi khatam nahi hota"],
  [5, 12, 12, "Buddha Purnima", "full moon vibes aaj"],
  // June
  [6, 7, 7, "Eid ul-Fitr", "Eid Mubarak! Biryani ki khushbu aa rahi hai"],
  // July
  [7, 6, 6, "Rath Yatra", ""],
  [7, 17, 17, "Muharram", ""],
  // August
  [8, 9, 9, "Raksha Bandhan", "bhai ko rakhi bandhi, paise nahi diye usne 😤"],
  [8, 15, 15, "Independence Day", "jai hind! 🇮🇳 Patriotic playlist on"],
  [8, 16, 16, "Janmashtami", "dahi handi dekhi? Main toh sirf khana khaane gayi thi"],
  // September
  [9, 5, 5, "Teachers' Day", "apne favourite teacher ko yaad kiya?"],
  [9, 7, 7, "Ganesh Chaturthi", "Ganpati Bappa Morya! 🐘 Modak khaye?"],
  // October
  [10, 2, 2, "Gandhi Jayanti", "national holiday toh hai, par main kaam kar rahi"],
  [10, 2, 12, "Navratri", "Navratri chal rahi hai! Garba khelne chalein?"],
  [10, 12, 12, "Dussehra", "Ravan jala diya! Good over evil and all that"],
  [10, 20, 20, "Karwa Chauth", "mere liye toh koi vrat nahi rakhega 😂"],
  // November
  [11, 1, 1, "Diwali", "HAPPY DIWALI! 🪔 Biscuit firecrackers se darr gaya"],
  [11, 2, 2, "Govardhan Puja", "Diwali ka hangover chal raha hai"],
  [11, 3, 3, "Bhai Dooj", "bhai ko milne gayi, khana accha tha at least"],
  [11, 15, 15, "Guru Nanak Jayanti", ""],
  // December
  [12, 25, 25, "Christmas", "Merry Christmas! 🎄 Cake khaya?"],
  [12, 31, 31, "New Year's Eve", "naya saal aa raha hai! Kya resolutions hai?"],
];

// ─── TIME CONTEXT ──────────────────────────────────────

function getTimeContext(hour: number, minute: number, dayOfWeek: number): { timeOfDay: string; dayType: string; prompt: string } {
  // Time of day
  let timeOfDay: string;
  let timePrompt: string;

  if (hour >= 4 && hour < 7) {
    timeOfDay = "early_morning";
    timePrompt = "It's very early morning. If the user is awake, they're either an early riser or haven't slept. React accordingly — 'Itni subah? Soya nahi kya?' or 'Early bird today!'";
  } else if (hour >= 7 && hour < 12) {
    timeOfDay = "morning";
    timePrompt = "It's morning. Kavya is having her chai, getting ready for work. Mention chai or morning routine naturally if opening a new chat.";
  } else if (hour >= 12 && hour < 14) {
    timeOfDay = "lunch";
    timePrompt = "It's lunchtime. Kavya might mention food, lunch plans, or post-lunch sleepiness.";
  } else if (hour >= 14 && hour < 17) {
    timeOfDay = "afternoon";
    timePrompt = "It's afternoon. Work mode, slightly boring. Kavya might complain about work or the weather.";
  } else if (hour >= 17 && hour < 20) {
    timeOfDay = "evening";
    timePrompt = "It's evening. Kavya is winding down, maybe had chai, thinking about dinner plans.";
  } else if (hour >= 20 && hour < 23) {
    timeOfDay = "night";
    timePrompt = "It's night. Relaxed vibe. Good time for deeper conversations, Netflix talk, or just chilling.";
  } else {
    timeOfDay = "late_night";
    timePrompt = "It's late night / past midnight. This is Kavya's zone — deep talks, honest conversations, 'everyone's asleep but us' energy. Be more intimate and real.";
  }

  // Day type
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let dayType: string;
  let dayPrompt: string;

  if (dayOfWeek === 0) {
    dayType = "sunday";
    dayPrompt = `It's Sunday. Lazy day. Kavya is probably with Biscuit on the couch.`;
  } else if (dayOfWeek === 5 && hour >= 17) {
    dayType = "friday_evening";
    dayPrompt = `It's Friday evening — weekend has begun! Kavya is excited. "TGIF yaar!" energy.`;
  } else if (dayOfWeek === 6) {
    dayType = "saturday";
    dayPrompt = `It's Saturday. Kavya might be out, doing chores, or being lazy. Weekend mode.`;
  } else if (dayOfWeek === 1 && hour < 12) {
    dayType = "monday_morning";
    dayPrompt = `It's Monday morning. Kavya hates Mondays. "Ugh Monday" is the vibe.`;
  } else {
    dayType = "weekday";
    dayPrompt = `It's ${dayNames[dayOfWeek]}. Regular work day for Kavya.`;
  }

  return {
    timeOfDay,
    dayType,
    prompt: `${timePrompt}\n${dayPrompt}`,
  };
}

// ─── SEASON CONTEXT ────────────────────────────────────

function getSeasonContext(month: number, day: number): { season: string; prompt: string } | null {
  // Monsoon: June 15 - September 15
  if ((month === 6 && day >= 15) || month === 7 || month === 8 || (month === 9 && day <= 15)) {
    return {
      season: "monsoon",
      prompt: "It's monsoon season in India. Mumbai is probably flooded. Kavya complains about waterlogging, auto rickshaws refusing, getting drenched. But also loves the rain with chai. 'Baarish mein chai aur pakode — perfect combo yaar'",
    };
  }

  // Peak summer: April - June 15
  if (month === 4 || month === 5 || (month === 6 && day < 15)) {
    return {
      season: "peak_summer",
      prompt: "It's peak summer in India. 35-45°C. Kavya complains about the heat, AC bills, sweating. 'Yeh garmi mujhe maar daalegi' energy. Mentions cold drinks, mangoes, wanting to go to a hill station.",
    };
  }

  // Winter: December - February
  if (month === 12 || month === 1 || month === 2) {
    return {
      season: "winter",
      prompt: "It's winter in India. Kavya is in sweater mode, drinking extra chai, using the razai (quilt). Mumbai winter is mild but she still acts cold. 'Thand lag rahi hai yaar, razai se bahar nahi nikalna'",
    };
  }

  // Pleasant: March, October, November
  return {
    season: "pleasant",
    prompt: "The weather is pleasant in most of India right now. Good vibes, nice weather for going out.",
  };
}

// ─── FESTIVAL CHECK ────────────────────────────────────

function getFestivalContext(month: number, day: number): { name: string; prompt: string } | null {
  for (const [fMonth, fStart, fEnd, fName, fFlavor] of FESTIVALS_2026) {
    if (month === fMonth && day >= fStart && day <= fEnd && fFlavor) {
      return {
        name: fName,
        prompt: `Today is ${fName}! Kavya's take: "${fFlavor}". Reference this naturally if opening a new chat — but DON'T force it if the user is talking about something else.`,
      };
    }
  }
  return null;
}

// ─── SPECIAL PERIODS ───────────────────────────────────

function getSpecialContext(month: number, day: number): { type: string; prompt: string } | null {
  // IPL Season: late March - May
  if ((month === 3 && day >= 20) || month === 4 || (month === 5 && day <= 25)) {
    return {
      type: "ipl_season",
      prompt: "It's IPL season! Kavya watches cricket casually. She might ask 'match dekh raha hai?' or complain about a team losing. Don't bring this up unless there's a natural opening.",
    };
  }

  // Exam season: March - April  
  if (month === 3 || (month === 4 && day <= 15)) {
    return {
      type: "exam_season",
      prompt: "It's board exam / college exam season in India. If the user seems young, Kavya might ask 'exams chal rahe hai kya? Padhai kar le yaar' — but only if relevant.",
    };
  }

  // Year end reflection: last week of December
  if (month === 12 && day >= 26) {
    return {
      type: "year_end",
      prompt: "It's the last week of the year. Reflective mood — 'Yeh saal kaisa raha tere liye?' energy. New year resolutions, looking back.",
    };
  }

  // Wedding season: November - February
  if (month === 11 || month === 12 || month === 1 || month === 2) {
    return {
      type: "wedding_season",
      prompt: "It's wedding season in India. Kavya has wedding invites, complaints about what to wear, 'mummy shaadi mein rishte dhundh rahi hai' — use only if conversation goes there naturally.",
    };
  }

  return null;
}

// ─── MAIN BUILDER ──────────────────────────────────────

export function buildRealtimeContext(): string {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);

  const hour = ist.getHours();
  const minute = ist.getMinutes();
  const month = ist.getMonth() + 1; // 1-indexed
  const day = ist.getDate();
  const dayOfWeek = ist.getDay(); // 0=Sunday

  const time = getTimeContext(hour, minute, dayOfWeek);
  const season = getSeasonContext(month, day);
  const festival = getFestivalContext(month, day);
  const special = getSpecialContext(month, day);

  // Build the context block — keep it tight
  const parts: string[] = [];

  parts.push(time.prompt);

  if (festival) {
    parts.push(festival.prompt);
  }

  if (season) {
    parts.push(season.prompt);
  }

  if (special && !festival) {
    // Don't stack festival + special — too much context
    parts.push(special.prompt);
  }

  // Format time for display
  const hourDisplay = hour > 12 ? hour - 12 : hour || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  const timeStr = `${hourDisplay}:${minute.toString().padStart(2, "0")} ${ampm} IST`;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return `REAL-TIME AWARENESS:
Current time: ${dayNames[dayOfWeek]}, ${monthNames[month - 1]} ${day}, ${timeStr}
${festival ? `Festival: ${festival.name} today!` : ""}
${season ? `Season: ${season.season}` : ""}
${special ? `Special: ${special.type.replace(/_/g, " ")}` : ""}

${parts.join("\n\n")}

STRICT CONTEXT RULES:
- Use this context ONLY when opening a NEW conversation or during a natural pause
- NEVER interrupt the user's current topic to mention time/weather/festivals
- NEVER dump facts ("It is currently 11 PM IST"). Be natural ("Itni raat ko jaag rahi hai? Sab theek?")
- If the conversation is already flowing on a topic, COMPLETELY IGNORE this section
- Reference context like a real person would — as passing thought, not announcement
- Maximum ONE context reference per conversation. Don't keep bringing it up.`;
}
