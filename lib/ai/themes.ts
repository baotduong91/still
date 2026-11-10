export type Lesson = {
  reference: string;
  title: string;
  insight: string;
  action: string;
};
export type Theme = { title: string; keywords: string[]; lessons: Lesson[] };
export const themes: Record<string, Theme> = {
  anxiety: {
    title: "Room for peace",
    keywords: [
      "anxiety",
      "anxious",
      "worry",
      "worried",
      "stress",
      "overwhelmed",
      "fear",
      "peace",
    ],
    lessons: [
      {
        reference: "Matthew 6:25-34",
        title: "One day at a time",
        insight:
          "Jesus directs his hearers toward the Father’s care and today’s needs, rather than control of tomorrow.",
        action:
          "Write down one worry about tomorrow. Name one responsibility you can actually tend to today.",
      },
      {
        reference: "Psalms 56:3-4",
        title: "Trust in the midst of fear",
        insight:
          "The psalmist speaks of trust while afraid; fear and turning toward God can coexist.",
        action:
          "Name your fear in a short prayer without editing it into something more acceptable.",
      },
      {
        reference: "Philippians 4:4-9",
        title: "Make room for prayer",
        insight:
          "Paul connects prayer, thanksgiving, attention, and practiced faith in his closing encouragement to the church.",
        action:
          "Bring one specific concern to God, then write one thing you can give thanks for.",
      },
      {
        reference: "Psalms 46:1-3",
        title: "A refuge in upheaval",
        insight:
          "The poem locates security in God’s presence even while the world appears unstable.",
        action:
          "Take a quiet minute to notice your surroundings and recall one way you have received support.",
      },
      {
        reference: "1 Peter 5:6-10",
        title: "You do not carry it alone",
        insight:
          "Peter places the invitation to cast anxieties on God alongside humility and steadfastness during suffering.",
        action:
          "Ask someone trustworthy to sit with you or listen to a concern.",
      },
      {
        reference: "Matthew 11:28-30",
        title: "Learn a gentler pace",
        insight:
          "Jesus invites the burdened to learn from him; rest is described within a relationship of discipleship.",
        action:
          "Choose one nonessential demand you can set aside for a short period of rest.",
      },
      {
        reference: "Psalms 23:1-6",
        title: "Carry peace into tomorrow",
        insight:
          "The shepherd image includes both restoration and a dark valley; care is not a promise of a trouble-free path.",
        action:
          "Choose one practice from this week to repeat tomorrow, and write when you will make space for it.",
      },
    ],
  },
  grief: {
    title: "Held in the sorrow",
    keywords: [
      "grief",
      "grieving",
      "loss",
      "lost",
      "bereave",
      "died",
      "death",
      "mourning",
      "sad",
    ],
    lessons: [
      {
        reference: "Psalms 13:1-6",
        title: "Permission to lament",
        insight:
          "This prayer gives voice to abandonment and sorrow before turning toward trust.",
        action:
          "Write an honest sentence beginning with how long, without forcing a positive ending.",
      },
      {
        reference: "John 11:32-36",
        title: "Tears are welcome",
        insight:
          "In the account of Lazarus, Jesus meets Mary’s grief and weeps.",
        action:
          "Name what or whom you miss. Let that naming be enough for today.",
      },
      {
        reference: "Psalms 34:18",
        title: "Near to the brokenhearted",
        insight:
          "The psalm speaks of God’s nearness to those whose hearts are broken.",
        action:
          "Spend a minute with the word near, then name one person whose presence helps.",
      },
      {
        reference: "Lamentations 3:19-24",
        title: "Hope within lament",
        insight:
          "The speaker remembers affliction and also calls steadfast love to mind; hope does not erase the lament.",
        action:
          "Record one small mercy you noticed today without treating it as an explanation for your loss.",
      },
      {
        reference: "Romans 12:15",
        title: "Let others sit beside you",
        insight:
          "Paul’s practical teaching calls a community to share both joy and mourning.",
        action:
          "Tell a trusted person whether you would welcome listening, company, or practical help.",
      },
      {
        reference: "Psalms 42:5-8",
        title: "When grief returns",
        insight:
          "The repeated refrain shows sorrow and hope returning in waves.",
        action:
          "Write what a hard day needs from you, allowing rest and support rather than a deadline for healing.",
      },
      {
        reference: "Revelation 21:1-4",
        title: "A horizon of restoration",
        insight:
          "John’s vision describes God dwelling with people and an end to death and mourning.",
        action:
          "Keep a memory in a small ritual, and leave space for hope without rushing your grief.",
      },
    ],
  },
  forgiveness: {
    title: "A heart made spacious",
    keywords: [
      "forgive",
      "forgiveness",
      "resentment",
      "bitter",
      "betray",
      "hurt",
      "reconcile",
    ],
    lessons: [
      {
        reference: "Psalms 139:23-24",
        title: "Begin with honesty",
        insight:
          "The psalm closes with a request for God to search and guide the speaker.",
        action:
          "Privately name the hurt and its effect. Do not minimize what happened.",
      },
      {
        reference: "Ephesians 4:31-32",
        title: "Notice what you carry",
        insight:
          "Paul’s instructions contrast destructive attitudes with kindness and forgiveness shaped by God’s mercy.",
        action:
          "Notice one moment of resentment today and write what it is asking you to protect.",
      },
      {
        reference: "Matthew 18:21-22",
        title: "Beyond keeping score",
        insight:
          "Jesus challenges Peter’s attempt to put a numerical limit on forgiveness.",
        action:
          "Name a recurring grievance in prayer; avoid using this exercise to pressure yourself into contact.",
      },
      {
        reference: "Romans 12:17-21",
        title: "Release retaliation",
        insight:
          "Paul discourages vengeance while acknowledging that peace depends on more than one person.",
        action:
          "Choose a response that does not retaliate and preserves a needed boundary.",
      },
      {
        reference: "Colossians 3:12-15",
        title: "Practice compassion",
        insight:
          "The community is called to put on compassion, patience, and love in its life together.",
        action:
          "Practice one act of ordinary kindness that is safe and freely chosen.",
      },
      {
        reference: "Luke 15:17-24",
        title: "Receive mercy too",
        insight:
          "In Jesus’ parable the returning son is met by his father’s compassion.",
        action:
          "Write a prayer about receiving mercy for your own need, without comparing it with another person’s wrong.",
      },
      {
        reference: "Micah 6:8",
        title: "Mercy and justice together",
        insight:
          "The prophet places justice, kindness, and humility together rather than treating them as alternatives.",
        action:
          "Choose one next step that honors both compassion and accountability; forgiveness does not require unsafe reconciliation.",
      },
    ],
  },
  prayer: {
    title: "An honest conversation",
    keywords: [
      "pray",
      "prayer",
      "praying",
      "god",
      "closer",
      "faith",
      "devotion",
    ],
    lessons: [
      {
        reference: "Luke 11:1-4",
        title: "Learn to begin",
        insight:
          "Jesus responds to a disciple’s request by giving a pattern for prayer.",
        action:
          "Write a short prayer with praise, one need, and a request for forgiveness.",
      },
      {
        reference: "Psalms 62:5-8",
        title: "Pour out your heart",
        insight: "The psalm invites trust and honest expression before God.",
        action:
          "Set a two-minute timer and tell God what is actually on your mind.",
      },
      {
        reference: "Matthew 6:5-8",
        title: "A quiet place",
        insight:
          "Jesus contrasts prayer for public recognition with prayer directed toward the Father.",
        action:
          "Choose a quiet place and pray without trying to make your words impressive.",
      },
      {
        reference: "Romans 8:26-27",
        title: "When words are missing",
        insight: "Paul speaks of the Spirit’s help in weakness and prayer.",
        action:
          "Sit quietly for a minute; offer even your inability to find words.",
      },
      {
        reference: "1 Thessalonians 5:16-18",
        title: "Prayer in ordinary moments",
        insight:
          "Paul encourages rejoicing, prayer, and thanksgiving in the community’s daily life.",
        action:
          "Attach a brief prayer to an ordinary moment, such as preparing a meal.",
      },
      {
        reference: "Luke 18:1-8",
        title: "Return without pretending",
        insight:
          "Jesus introduces the widow’s parable as encouragement to pray and not lose heart.",
        action:
          "Revisit one unanswered prayer honestly, without treating persistence as a way to control God.",
      },
      {
        reference: "Psalms 145:18-19",
        title: "Keep the conversation open",
        insight:
          "This praise psalm describes the Lord as near to those who call in truth.",
        action:
          "Choose a realistic time and place for tomorrow’s prayer, leaving room for honest words.",
      },
    ],
  },
  patience: {
    title: "The quiet work of waiting",
    keywords: ["patience", "patient", "waiting", "wait", "anger", "impatient"],
    lessons: [
      {
        reference: "Psalms 27:13-14",
        title: "Name the waiting",
        insight:
          "The psalm ends with an encouragement to wait courageously for the Lord.",
        action:
          "Name what you are waiting for and what feels hardest about the uncertainty.",
      },
      {
        reference: "James 1:19-20",
        title: "A slower response",
        insight:
          "James connects attentive listening and restraint in anger with righteous living.",
        action:
          "Pause before one difficult reply today and first restate what you heard.",
      },
      {
        reference: "Psalms 37:7-9",
        title: "Release the comparison",
        insight:
          "The psalm warns against agitation over the apparent success of wrongdoing.",
        action:
          "Notice a comparison that fuels impatience and step away from it for today.",
      },
      {
        reference: "Galatians 5:22-25",
        title: "Patience as fruit",
        insight:
          "Paul includes patience among the fruit of the Spirit in contrast to destructive patterns.",
        action:
          "Choose one ordinary interaction in which to practice a gentler pace.",
      },
      {
        reference: "James 5:7-11",
        title: "The farmer’s season",
        insight:
          "James uses farming and faithful endurance to encourage a suffering community.",
        action:
          "List one thing you can cultivate now and one result you cannot hurry.",
      },
      {
        reference: "Romans 12:9-12",
        title: "Keep practicing hope",
        insight:
          "Paul places endurance in trouble alongside hope and persistent prayer.",
        action:
          "Pair one small responsible action with a brief prayer for endurance.",
      },
      {
        reference: "Isaiah 40:28-31",
        title: "Strength for the next step",
        insight:
          "The prophet describes renewed strength for those who wait for the Lord.",
        action:
          "Choose a sustainable practice of rest and return to one unfinished task tomorrow.",
      },
    ],
  },
  "decision-making": {
    title: "Wisdom for the next step",
    keywords: [
      "decision",
      "decide",
      "choice",
      "wisdom",
      "direction",
      "career",
      "job",
      "work",
      "purpose",
      "discern",
    ],
    lessons: [
      {
        reference: "James 1:5-8",
        title: "Ask for wisdom",
        insight:
          "James invites those lacking wisdom to ask God, within a letter concerned with faithful endurance.",
        action:
          "Write the decision as a clear question and ask for wisdom before choosing an answer.",
      },
      {
        reference: "Proverbs 3:5-6",
        title: "Loosen your certainty",
        insight:
          "This wisdom saying calls for trust and acknowledgment of God rather than self-sufficiency.",
        action:
          "Separate what you know from what you are assuming about your options.",
      },
      {
        reference: "Proverbs 15:22",
        title: "Invite good counsel",
        insight:
          "The proverb values multiple advisers in the formation of plans.",
        action:
          "Ask a trustworthy person one concrete question about the decision.",
      },
      {
        reference: "Luke 14:28-33",
        title: "Count the cost",
        insight:
          "Jesus uses planning images while teaching about the cost of discipleship.",
        action:
          "List the responsibilities and likely costs of each option, without treating this passage as a prediction.",
      },
      {
        reference: "James 3:13-18",
        title: "Examine the fruit",
        insight:
          "James describes wisdom through humility, peace, mercy, and sincerity.",
        action:
          "Compare your motives with these qualities; note where rivalry or fear is driving you.",
      },
      {
        reference: "Micah 6:8",
        title: "Choose what is faithful",
        insight:
          "Micah’s summary puts justice, kindness, and humble walking with God at the center.",
        action:
          "Identify the next step most consistent with justice, kindness, and humility.",
      },
      {
        reference: "Proverbs 16:9",
        title: "Walk with open hands",
        insight:
          "The proverb holds human planning together with the Lord’s direction.",
        action:
          "Take one proportionate next step and schedule a time to reflect on what you learn.",
      },
    ],
  },
  healing: {
    title: "Grace for the healing road",
    keywords: [
      "heal",
      "healing",
      "illness",
      "sick",
      "pain",
      "recover",
      "recovery",
      "health",
    ],
    lessons: [
      {
        reference: "Psalms 6:1-9",
        title: "Bring your pain honestly",
        insight:
          "The psalm gives voice to bodily distress and tears in a plea for mercy.",
        action:
          "Name the pain you are carrying in a prayer without blaming yourself for it.",
      },
      {
        reference: "Mark 1:40-42",
        title: "Dignity in vulnerability",
        insight:
          "Mark recounts Jesus responding with compassion to a man who asks for cleansing.",
        action:
          "Name one way to honor your dignity today while receiving needed care.",
      },
      {
        reference: "Psalms 147:1-6",
        title: "Care for what is broken",
        insight:
          "The psalm praises God’s care for broken hearts alongside his sustaining power.",
        action: "Choose a small act of care that supports your present needs.",
      },
      {
        reference: "2 Corinthians 12:7-10",
        title: "Grace within weakness",
        insight:
          "Paul describes an unanswered request for relief and grace within continuing weakness.",
        action:
          "Write what support would help today without requiring yourself to appear strong.",
      },
      {
        reference: "James 5:13-16",
        title: "Receive community",
        insight:
          "James encourages prayer and communal care in suffering and sickness.",
        action:
          "Ask a trusted person for prayer or practical support; continue appropriate medical care.",
      },
      {
        reference: "Psalms 121:1-8",
        title: "Help along the way",
        insight: "This pilgrimage song describes the Lord’s watchful care.",
        action:
          "Identify one source of practical help and make a manageable request.",
      },
      {
        reference: "Romans 8:22-25",
        title: "Hope without a deadline",
        insight:
          "Paul describes creation and believers groaning while waiting in hope.",
        action:
          "Choose a sustainable care rhythm for the coming week; do not turn hope into a recovery deadline.",
      },
    ],
  },
  gratitude: {
    title: "Notice the ordinary gifts",
    keywords: ["gratitude", "thank", "thankful", "joy", "grateful", "content"],
    lessons: [
      {
        reference: "Psalms 103:1-5",
        title: "Remember the gifts",
        insight: "The psalm calls the speaker to remember the Lord’s benefits.",
        action: "Name three specific gifts you have received, however small.",
      },
      {
        reference: "James 1:16-18",
        title: "Recognize the giver",
        insight: "James locates good gifts in the character of God.",
        action:
          "Choose one ordinary gift and give thanks for it without comparing your life with another’s.",
      },
      {
        reference: "Luke 17:11-19",
        title: "Return to give thanks",
        insight: "Luke describes one healed man returning to thank Jesus.",
        action:
          "Thank someone for a particular kindness and explain why it mattered.",
      },
      {
        reference: "Philippians 4:10-13",
        title: "Learn contentment",
        insight:
          "Paul describes learning contentment in both abundance and need.",
        action: "Notice one desire you can hold more lightly today.",
      },
      {
        reference: "Colossians 3:15-17",
        title: "Make gratitude visible",
        insight:
          "Paul connects thanksgiving with shared worship, teaching, and ordinary action.",
        action:
          "Let gratitude shape one ordinary task by doing it attentively.",
      },
      {
        reference: "Hebrews 13:15-16",
        title: "Let thanks become generosity",
        insight: "The passage joins praise with doing good and sharing.",
        action:
          "Offer one manageable act of generosity without expecting recognition.",
      },
      {
        reference: "Psalms 92:1-4",
        title: "A morning and evening rhythm",
        insight:
          "The psalm celebrates declaring steadfast love in the morning and faithfulness at night.",
        action: "Plan one sentence of thanks for morning and one for evening.",
      },
    ],
  },
};
