/** Official Sarah avatar & logo (same asset as platform-wide `assets/sarah-avatar.svg`). */
window.SARAH_PROTOTYPE = {
  SARAH_AVATAR_SRC: 'assets/sarah-avatar.svg',

  MOCK_USER: {
    name: 'Spencer',
    email: 'spencer@example.com',
    avatar: 'assets/profile/spencer-avatar.jpg',
  },

  /**
   * BP-01: Business Profile — professional identity (prototype mock; distinct from Persona / MOCK_PROFILE).
   */
  MOCK_BUSINESS_PROFILE: {
    username: 'spencer-biz',
    joined: '2026',
    verified: false,
    displayName: 'Spencer Example',
    headline: 'Product & design lead · building calmer consumer AI',
    bio: 'Helping teams ship trustworthy AI assistants for local businesses. Open to advisory and product partnerships.',
    location: 'Johannesburg · Southern Africa',
    industry: 'Technology & AI',
    jobTitle: 'Founder & Product Director',
    interests: ['B2B SaaS', 'UX research', 'Sarah Network'],
    following: 128,
    followers: 890,
    posts: 12,
    cover: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    coverFallback: 'assets/discover/green-haven-hero.jpg',
    avatarFallback: 'assets/discover/green-haven-fallback.svg',
    sarahPlan: 'Business Starter (prototype)',
    sarahStatus: 'Business Sarah · BP-01 shell',
    connectedCompanyPortals: 2,
    activeAssignments: 4,
  },

  MOCK_BUSINESS_PROFILE_POSTS: [
    {
      id: 'bp1',
      time: '4h',
      body: 'Shipping BP-01: Business Profile as a dedicated environment — not bolted onto the Persona Profile.',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
      likes: 34,
      comments: 5,
    },
    {
      id: 'bp2',
      time: '1d',
      body: 'Reminder: Business Sarah coordinates; Company Sarah executes inside the portal. Permissions stay dual-sided.',
      image: 'assets/companies/smilemore-avatar.jpg',
      likes: 52,
      comments: 8,
    },
  ],

  MOCK_PROFILE: {
    username: 'spencer',
    joined: '2026',
    verified: true,
    bio: 'Building with Sarah — personal AI, local businesses, and a calmer way to get things done.',
    location: 'Johannesburg',
    occupation: 'Product & design',
    interests: ['AI', 'Local business', 'Running'],
    following: 245,
    followers: 1240,
    posts: 38,
    cover: 'assets/profile/spencer-cover.jpg',
    coverFallback: 'assets/discover/green-haven-hero.jpg',
    avatarFallback: 'assets/discover/green-haven-fallback.svg',
    sarahPlan: 'Sarah Free',
    sarahStatus: 'Personal Sarah active',
    connectedCompanySarah: ['SmileMore Dental', 'Green Haven Cafe'],
  },

  MOCK_PROFILE_POSTS: [
    {
      id: 'pp1',
      time: '2h',
      body: 'Personal Sarah nailed my week plan in one chat. Status + Work mode is the combo.',
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80',
      likes: 84,
      comments: 12,
    },
    {
      id: 'pp2',
      time: '5h',
      body: 'Green Haven on Discover — best oat flat white in the city.',
      image: 'assets/discover/green-haven-hero.jpg',
      likes: 156,
      comments: 23,
    },
    {
      id: 'pp3',
      time: '1d',
      body: 'Morning run done. Asked Sarah to block focus time — already on my calendar mock.',
      image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80',
      likes: 42,
      comments: 6,
    },
    {
      id: 'pp4',
      time: '2d',
      body: 'Supporting local — shout out to Central Motors for a smooth test drive booking via Company Sarah.',
      image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80',
      likes: 91,
      comments: 8,
    },
    {
      id: 'pp5',
      time: '3d',
      body: 'Prototype day with the team. Sarah App is going to feel like home.',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80',
      likes: 203,
      comments: 31,
    },
    {
      id: 'pp6',
      time: '4d',
      body: 'Weekend market finds — Discover category “Market” is underrated.',
      image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&q=80',
      likes: 67,
      comments: 9,
    },
    {
      id: 'pp7',
      time: '5d',
      body: 'SmileMore reminder handled in Work mode. Approval flow feels real already.',
      image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80',
      likes: 38,
      comments: 4,
    },
    {
      id: 'pp8',
      time: '1w',
      body: 'Johannesburg sunset from the roof — grateful for slow evenings.',
      image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
      likes: 312,
      comments: 44,
    },
  ],

  MOCK_PROFILE_PHOTOS: [
    { id: 'ph1', src: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&q=80', alt: 'Workspace' },
    { id: 'ph2', src: 'assets/discover/green-haven-2.jpg', alt: 'Cafe' },
    { id: 'ph3', src: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&q=80', alt: 'Running trail' },
    { id: 'ph4', src: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80', alt: 'Market' },
    { id: 'ph5', src: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80', alt: 'Team' },
    { id: 'ph6', src: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&q=80', alt: 'City skyline' },
    { id: 'ph7', src: 'assets/discover/green-haven-4.jpg', alt: 'Food' },
    { id: 'ph8', src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80', alt: 'Brunch' },
  ],

  MOCK_PROFILE_VIDEOS: [
    { id: 'pv1', thumb: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=600&q=80', title: 'How I use Personal Sarah', duration: '1:24' },
    { id: 'pv2', thumb: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&q=80', title: 'Green Haven walk-through', duration: '0:48' },
    { id: 'pv3', thumb: 'https://images.unsplash.com/photo-1533750349088-cd871a92f390?w=600&q=80', title: 'Week planning with Sarah', duration: '2:05' },
    { id: 'pv4', thumb: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&q=80', title: 'Morning run vlog', duration: '0:36' },
    { id: 'pv5', thumb: 'https://images.unsplash.com/photo-1598327272328-554c119d0a95?w=600&q=80', title: 'Discover favourites', duration: '1:12' },
    { id: 'pv6', thumb: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80', title: 'Work mode demo', duration: '0:52' },
    { id: 'pv7', thumb: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&q=80', title: 'Team stand-up clip', duration: '1:40' },
    { id: 'pv8', thumb: 'https://images.unsplash.com/photo-1516321497487-4a4188260810?w=600&q=80', title: 'Sarah App sneak peek', duration: '2:18' },
  ],

  MOCK_BUSINESS_PROFILE_ACTIVITY: [
    {
      id: 'ba1',
      type: 'work',
      label: 'Work assignment',
      time: '3h ago',
      preview: 'Delegated: Q4 partner outreach brief',
      thumb: 'assets/sarah-avatar.svg',
    },
    {
      id: 'ba2',
      type: 'sarah',
      label: 'Business Sarah',
      time: 'Yesterday',
      preview: 'Prepared executive summary — 2 connected companies',
      thumb: 'assets/sarah-avatar.svg',
    },
    {
      id: 'ba3',
      type: 'post',
      label: 'Professional update',
      time: '2d ago',
      preview: 'Shared: prototype roadmap for Sarah App Business Profile',
      thumb: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80',
    },
  ],

  MOCK_PROFILE_ACTIVITY: [
    { id: 'pa1', type: 'post', label: 'Shared a post', time: '2h ago', preview: 'Personal Sarah nailed my week plan…', thumb: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&q=80' },
    { id: 'pa2', type: 'sarah', label: 'Personal Sarah', time: '4h ago', preview: 'Completed “Summarise my open chats” thread', thumb: 'assets/sarah-avatar.svg' },
    { id: 'pa3', type: 'photo', label: 'Added photos', time: 'Yesterday', preview: '3 new photos to your profile', thumb: 'assets/discover/green-haven-2.jpg' },
    { id: 'pa4', type: 'video', label: 'Posted a video', time: 'Yesterday', preview: 'How I use Personal Sarah', thumb: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=400&q=80' },
    { id: 'pa5', type: 'post', label: 'Shared a post', time: '2d ago', preview: 'Green Haven on Discover…', thumb: 'assets/discover/green-haven-hero.jpg' },
    { id: 'pa6', type: 'work', label: 'Work task', time: '3d ago', preview: 'Approve SmileMore booking — queued', thumb: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=400&q=80' },
    { id: 'pa7', type: 'post', label: 'Shared a post', time: '5d ago', preview: 'Johannesburg sunset from the roof…', thumb: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&q=80' },
    { id: 'pa8', type: 'discover', label: 'Discover', time: '1w ago', preview: 'Followed Green Haven Cafe', thumb: 'assets/discover/green-haven-3.jpg' },
  ],

  MOCK_PROFILE_SAVED: [
    { id: 'ps1', title: 'Green Haven menu ideas', type: 'Post' },
    { id: 'ps2', title: 'Central Motors test drive tips', type: 'Chat' },
    { id: 'ps3', title: 'Running plan — Sarah export', type: 'Sarah' },
    { id: 'ps4', title: 'Market vendors list', type: 'Discover' },
  ],

  MOCK_PROFILE_ACCOUNT_SECTIONS: [
    {
      id: 'sarah',
      title: 'Personal Sarah',
      subtitle: 'Private — not shown on your public profile',
      items: [
        { label: 'Personal Sarah status', detail: 'Active · 20 chats/day remaining', action: 'none' },
        { label: 'Personalisation preferences', detail: 'Tone, language, memory', action: 'mock' },
        { label: 'My Knowledge', detail: 'Sections Sarah may use', action: 'knowledge' },
        { label: 'Activity & permissions', detail: 'What Sarah can access', action: 'mock' },
        { label: 'Connected Company Sarah', detail: '2 businesses', action: 'mock' },
      ],
    },
    {
      id: 'activity',
      title: 'My activity',
      subtitle: 'Your bookings and business interactions',
      items: [
        { label: 'My bookings', detail: '1 pending approval', action: 'mock' },
        { label: 'My enquiries', detail: 'Central Motors test drive', action: 'mock' },
        { label: 'Business connections', detail: '3 active', action: 'mock' },
        { label: 'My interactions', detail: 'Chats & follow-ups', action: 'chats' },
        { label: 'Saved businesses', detail: '4 saved on Discover', action: 'discover' },
        { label: 'My reviews', detail: 'Wave 2', action: 'disabled' },
      ],
    },
    {
      id: 'privacy',
      title: 'Account & privacy',
      subtitle: 'Private account controls',
      items: [
        { label: 'Personal information', detail: 'Name, email, phone', action: 'mock' },
        { label: 'Login & security', detail: 'Password, 2FA', action: 'mock' },
        { label: 'Sign out', detail: 'End session on this device', action: 'sign-out' },
        { label: 'Privacy controls', detail: 'Who can see your Status', action: 'mock' },
        { label: 'Blocked accounts', detail: 'None', action: 'mock' },
        { label: 'Notification preferences', detail: 'Push, email, Sarah tips', action: 'mock' },
        { label: 'Data access & deletion', detail: 'Export or delete account', action: 'mock' },
      ],
    },
    {
      id: 'membership',
      title: 'Membership & payments',
      subtitle: 'Subscription and billing',
      items: [
        { label: 'Current subscription', detail: 'Sarah Free', action: 'billing' },
        { label: 'Upgrade membership', detail: 'Plus, Premium, Ultimate', action: 'billing' },
        { label: 'AI usage & credits', detail: 'Mock usage meter', action: 'mock' },
        { label: 'Payment methods', detail: 'Gate 6 — Wave 2', action: 'disabled' },
        { label: 'Billing history', detail: 'No invoices yet', action: 'disabled' },
      ],
    },
  ],

  MOCK_BUSINESS_PROFILE_ACCOUNT_SECTIONS: [
    {
      id: 'business-sarah',
      title: 'Business Sarah',
      subtitle: 'Professional assistant — separate from Personal Sarah',
      items: [
        { label: 'Business Sarah status', detail: 'BP-01 shell · configure in BP-01F', action: 'mock' },
        { label: 'Business My Knowledge', detail: 'Professional knowledge base · BP-01D', action: 'mock' },
        { label: 'Company Portal connections', detail: '2 connected (mock) · BP-01G', action: 'mock' },
        { label: 'Professional activity', detail: 'Assignments & approvals · BP-01C', action: 'mock' },
      ],
    },
    {
      id: 'business-account',
      title: 'Business account',
      subtitle: 'Professional identity & security',
      items: [
        { label: 'Verification', detail: 'Email · phone · professional (BP-01B)', action: 'mock' },
        { label: 'Profile visibility', detail: 'Public / connections-only · BP-01B', action: 'mock' },
        { label: 'Sign out', detail: 'End session on this device', action: 'sign-out' },
      ],
    },
    {
      id: 'business-billing',
      title: 'Business billing',
      subtitle: 'Separate from personal subscription (BP-01 §7)',
      items: [
        { label: 'Business plan', detail: 'Business Starter (prototype)', action: 'billing' },
        { label: 'Usage & limits', detail: 'Mock meter · BP-01H', action: 'mock' },
      ],
    },
  ],

  /** Square profile images for demo companies (feed, chats, thread). */
  COMPANY_AVATARS: {
    smilemore: 'assets/companies/smilemore-avatar.jpg',
    centralMotors: 'assets/companies/central-motors-avatar.jpg',
  },

  MOCK_NOTIFICATIONS: [
    {
      id: 'n1',
      title: 'SmileMore Dental',
      body: 'Your booking request is waiting for approval.',
      time: '2m ago',
      unread: true,
    },
    {
      id: 'n2',
      title: 'Central Motors',
      body: 'Saturday test-drive slot is still available.',
      time: '1h ago',
      unread: true,
    },
    {
      id: 'n3',
      title: 'Sarah',
      body: 'Personal Sarah summarized your week — tap to review.',
      time: '3h ago',
      unread: true,
    },
    {
      id: 'n4',
      title: 'Nandi M.',
      body: 'Liked your post on Status.',
      time: 'Yesterday',
      unread: false,
    },
  ],

  MOCK_FEED_TABS: [
    { id: 'for-you', label: 'For You' },
    { id: 'following', label: 'Following' },
    { id: 'companies', label: 'Companies' },
    { id: 'creators', label: 'Creators' },
    { id: 'videos', label: 'Videos' },
  ],

  MOCK_FEED: [
    {
      id: 'p1',
      tab: 'for-you',
      author: 'SmileMore Dental',
      authorType: 'company',
      verified: true,
      avatarKey: 'smilemore',
      time: '2h',
      body: 'Same-day emergency slots open this week — message us on Sarah App if you need care.',
      image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80',
      likes: 128,
      comments: 14,
      sponsored: false,
      previewComments: [
        { author: 'Lerato N.', text: 'Booked through Sarah — so smooth!' },
        { author: 'Mike T.', text: 'Do you still have Saturday slots?' },
      ],
    },
    {
      id: 'p2',
      tab: 'for-you',
      author: 'Nandi M.',
      authorType: 'creator',
      verified: true,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nandi',
      time: '4h',
      body: 'Three habits that changed how I run my week with Personal Sarah ✨',
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80',
      likes: 892,
      comments: 56,
      sponsored: false,
      previewComments: [{ author: 'Aisha K.', text: 'Saving this — Personal Sarah changed my mornings too.' }],
    },
    {
      id: 'p3',
      tab: 'for-you',
      author: 'Central Motors',
      authorType: 'company',
      verified: true,
      avatarKey: 'centralMotors',
      time: '6h',
      body: 'New arrivals on the floor — book a test drive through Company Sarah.',
      image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80',
      likes: 341,
      comments: 22,
      sponsored: true,
      previewComments: [{ author: 'Devon P.', text: 'Test drove yesterday — Company Sarah had everything ready.' }],
    },
    {
      id: 'p4',
      tab: 'following',
      author: 'Jordan Lee',
      authorType: 'user',
      verified: false,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
      time: '1d',
      body: 'Great launch night — thanks everyone who came out.',
      image: null,
      likes: 45,
      comments: 8,
      sponsored: false,
    },
    {
      id: 'p5',
      tab: 'for-you',
      author: 'GreenLeaf Spa',
      authorType: 'company',
      verified: false,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GreenLeaf',
      time: '8h',
      body: 'Winter wellness packages are live — 20% off when you book through Sarah this month.',
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80',
      likes: 210,
      comments: 31,
      sponsored: false,
    },
    {
      id: 'p6',
      tab: 'for-you',
      author: 'Thabo K.',
      authorType: 'creator',
      verified: true,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Thabo',
      time: '10h',
      body: 'How I use Company Sarah vs Personal Sarah — quick thread for newcomers.',
      image: null,
      likes: 1204,
      comments: 89,
      sponsored: false,
      previewComments: [
        { author: 'Samira L.', text: 'This should be pinned for every newcomer.' },
        { author: 'Chris M.', text: 'Company vs Personal Sarah — finally clear.' },
      ],
    },
    {
      id: 'p7',
      tab: 'following',
      author: 'Central Motors',
      authorType: 'company',
      verified: true,
      avatarKey: 'centralMotors',
      time: '12h',
      body: 'Service special: free inspection with any oil change booked via chat this weekend.',
      image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80',
      likes: 97,
      comments: 11,
      sponsored: false,
    },
    {
      id: 'p8',
      tab: 'for-you',
      author: 'SmileMore Dental',
      authorType: 'company',
      verified: true,
      avatarKey: 'smilemore',
      time: '1d',
      body: 'Kids’ check-up week — gentle first visits with our team. Tap to ask Company Sarah for slots.',
      image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80',
      likes: 76,
      comments: 9,
      sponsored: false,
    },
    {
      id: 'p9',
      tab: 'for-you',
      author: 'Aisha R.',
      authorType: 'creator',
      verified: false,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aisha',
      time: '2d',
      body: 'Local businesses on Discover are underrated — Green Haven alone is worth the trip.',
      image: 'assets/discover/green-haven-hero.jpg',
      imageFallback: 'assets/discover/green-haven-fallback.svg',
      likes: 412,
      comments: 37,
      sponsored: false,
    },
    {
      id: 'p10',
      tab: 'for-you',
      author: 'SmileMore Dental',
      authorType: 'company',
      verified: true,
      avatarKey: 'smilemore',
      time: '2d',
      body: 'Whitening consults this month include a free take-home kit — ask Company Sarah for details.',
      image: 'assets/discover/green-haven-2.jpg',
      imageFallback: 'assets/discover/green-haven-fallback.svg',
      likes: 203,
      comments: 28,
      sponsored: false,
    },
  ],

  MOCK_CHATS: [
    {
      id: 'smilemore-demo',
      name: 'SmileMore Dental',
      preview: 'Your booking request is pending your approval.',
      time: '2m',
      online: true,
      avatarKey: 'smilemore',
      company: true,
    },
    {
      id: 'central-motors',
      name: 'Central Motors',
      preview: 'The test drive slot for Saturday is still available.',
      time: '1h',
      online: false,
      avatarKey: 'centralMotors',
      company: true,
    },
    {
      id: 'jordan',
      name: 'Jordan Lee',
      preview: 'See you at the launch event!',
      time: 'Yesterday',
      online: true,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
      company: false,
    },
  ],

  MOCK_THREAD: {
    companyId: 'smilemore-demo',
    name: 'SmileMore Dental',
    verified: true,
    avatarKey: 'smilemore',
    messages: [
      {
        role: 'assistant',
        markdown: '**Hi Spencer** — I’m Sarah for SmileMore. How can I help today?',
        time: '09:12',
      },
      { role: 'user', content: 'Can I book a cleaning next week?', time: '09:13' },
      {
        role: 'assistant',
        markdown: `I found two slots that may work:

:::card
## Available times

[[badge:Not confirmed yet]]

1. **Tuesday 10:00**
2. **Thursday 14:30**

---

**Important:** this is **not a confirmed booking** until you approve in the app.

Reply with the slot you prefer and I will hold it pending your confirmation.
:::`,
        time: '09:13',
      },
    ],
  },

  /**
   * My Knowledge — MK-01 home & category navigation (prototype).
   * Areas: profile | life | goals | library | (understanding is rendered from sarahUnderstanding).
   */
  MOCK_MY_KNOWLEDGE: {
    areas: [
      {
        key: 'profile',
        label: 'Personal Profile',
        description: 'Who you are — identity, background, skills, preferences.',
      },
      {
        key: 'life',
        label: 'My Life',
        description: 'Circumstances, relationships, routines, and day-to-day context.',
      },
      {
        key: 'goals',
        label: 'Goals & Plans',
        description: 'What you want to achieve — personal, career, family, and more.',
      },
      {
        key: 'library',
        label: 'Knowledge Library',
        description: 'Documents, uploads, and saved reference material.',
      },
      {
        key: 'understanding',
        label: "Sarah's Understanding",
        description: 'What Sarah has learned with your approval — separate from raw chat.',
      },
    ],
    sarahUnderstanding: {
      summary: '24 approved memories · 3 awaiting your review',
      memories: [
        {
          id: 'm1',
          type: 'Preferences',
          title: 'Prefers detailed explanations',
          confidence: 'confirmed',
          source: 'You said in chat · approved',
          snippet: 'Step-by-step walkthroughs work better than one-line answers.',
        },
        {
          id: 'm2',
          type: 'Goals',
          title: 'Launch a hospitality side project',
          confidence: 'needs_confirmation',
          source: 'Suggested by Sarah',
          snippet: 'You mentioned exploring a restaurant concept — save as a business goal?',
        },
        {
          id: 'm3',
          type: 'Ongoing context',
          title: 'Busy weekday mornings',
          confidence: 'possibly_outdated',
          source: 'You added · last confirmed Feb 2025',
          snippet: 'Meetings before 9:00 are usually tight.',
        },
      ],
    },
    activity: {
      recentLearned: {
        label: 'Recently learned',
        title: 'Meeting tone: concise summaries',
        meta: 'Saved · Preferences',
      },
      pendingApproval: {
        label: 'Needs your approval',
        title: 'Career change exploration',
        meta: 'Suggested by Sarah · My Goals',
      },
    },
    /**
     * MK-02: default "Personal identity" fields (merged with local edits in the prototype).
     */
    personalIdentity: {
      fullName: '',
      preferredName: '',
      dateOfBirth: '',
      preferredLanguage: '',
      country: '',
      city: '',
      locationNote: '',
      nationalityBackground: '',
      educationQualifications: '',
      personalBiography: '',
      importantLifeExperiences: '',
      skillsExpertise: '',
      interestsHobbies: '',
      enjoysDislikes: '',
      communicationPreferences: '',
      responseStyle: 'detailed',
      personalValues: '',
      strengthsImprove: '',
    },

    /**
     * MK-02: Family & relationships — people rows (merged with local edits in the prototype).
     */
    familyRelationships: {
      people: [],
    },

    /**
     * MK-02: Goals & ambitions — goal rows (merged with local edits in the prototype).
     */
    goalsAmbitions: {
      goals: [],
    },

    /**
     * MK-02: Work & professional life — employment roles (merged with local edits in the prototype).
     */
    workProfessional: {
      roles: [],
    },

    /**
     * MK-02: Business & entrepreneurship — separate venture profiles (merged with local edits in the prototype).
     */
    businessEntrepreneurship: {
      ventures: [],
    },

    /**
     * MK-02: Education & learning — formal programs, courses/certs, and ongoing learning context.
     */
    educationLearning: {
      formalPrograms: [],
      coursesAndCerts: [],
      learningContext: {
        currentStudies: '',
        subjectsOfInterest: '',
        learningGoals: '',
        skillsDeveloping: '',
        studySchedule: '',
        learningPreferences: '',
        researchTopics: '',
        readingList: '',
        educationalDocumentsNote: '',
      }
    },

    /**
     * MK-02: Health & wellbeing — sensitive; optional mock lines only (merged with local edits).
     * Sarah must not treat chat as medical fact; medication decisions stay with you and your clinician.
     */
    healthWellbeing: {
      generalNotes: '',
      conditionsDiagnoses: '',
      allergies: '',
      medications: '',
      medicalHistory: '',
      healthcareProviders: '',
      appointments: '',
      testResultsDocuments: '',
      fitnessGoals: '',
      exerciseRoutines: '',
      nutritionPreferences: '',
      sleepRoutines: '',
      wellbeingGoals: '',
      healthReminders: ''
    },

    /**
     * MK-02: Financial life — sensitive; optional mock lines only (merged with local edits).
     * Never store credentials, card numbers, or full account identifiers here.
     */
    financialLife: {
      generalNotes: '',
      incomeSources: '',
      monthlyBudgetOverview: '',
      expensesRecurring: '',
      debtsLoans: '',
      savingsInvestments: '',
      insurancePolicies: '',
      taxesCompliance: '',
      financialGoals: '',
      accountsInstitutionsNote: '',
      documentsRecordsNote: '',
      financialReminders: ''
    },

    /**
     * MK-02: Lifestyle & preferences — how you live, eat, travel, and spend downtime (merged with local edits).
     */
    lifestylePreferences: {
      generalNotes: '',
      dailyWeeklyRhythm: '',
      homeEnvironment: '',
      foodDiningPreferences: '',
      travelStyle: '',
      leisureWeekends: '',
      entertainmentMedia: '',
      socialLife: '',
      shoppingPreferences: '',
      petsHobbies: '',
      lifestyleReminders: ''
    },

    /**
     * MK-02: Important dates & events — birthdays, renewals, travel blocks, deadlines (merged with local edits).
     */
    importantDatesEvents: {
      generalNotes: '',
      events: []
    },

    /**
     * MK-02: Documents & records — file metadata and where things live (merged with local edits); uploads in MK‑04.
     */
    documentsRecords: {
      generalNotes: '',
      records: []
    },

    /**
     * MK-02: Routines & daily life — schedules, habits, recurring commitments (merged with local edits).
     */
    routinesDailyLife: {
      generalNotes: '',
      typicalWeekday: '',
      typicalWeekend: '',
      morningRoutine: '',
      eveningWindDown: '',
      recurringCommitments: '',
      householdErrands: '',
      habitsTracking: '',
      interruptionsConstraints: '',
      routineReminders: ''
    },

    /**
     * MK-02: Property & assets — homes, vehicles, equipment (merged with local edits).
     */
    propertyAssets: {
      generalNotes: '',
      items: []
    },

    /**
     * MK-02: Travel & places — trips, destinations, passport hints (merged with local edits).
     */
    travelPlaces: {
      generalNotes: '',
      favoritePlaces: '',
      trips: []
    },

    /**
     * MK-02: Values & principles — private by default; optional mock line only (merged with local edits).
     */
    valuesPrinciples: {
      coreValuesPrinciples: '',
      ethicalBoundaries: '',
      faithPhilosophy: '',
      causesCommunities: '',
      politicalCivicNote: '',
      relationshipConsentBoundaries: '',
      topicsToAvoid: '',
      howSarahShouldWeigh: ''
    },
    categories: [
      {
        key: 'identity',
        label: 'Personal identity',
        subtitle: 'About me',
        area: 'profile',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Name, background, skills, communication and response style.',
      },
      {
        key: 'family',
        label: 'Family & relationships',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'People who matter — with privacy on each contact.',
      },
      {
        key: 'goals',
        label: 'Goals & ambitions',
        area: 'goals',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Milestones, priorities, status, and why each goal matters.',
      },
      {
        key: 'work',
        label: 'Work & professional life',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Roles, responsibilities, career path, and work patterns.',
      },
      {
        key: 'business',
        label: 'Business & entrepreneurship',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Separate profiles per venture so nothing gets mixed up.',
      },
      {
        key: 'education',
        label: 'Education & learning',
        area: 'library',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Studies, courses, reading lists, and skill development.',
      },
      {
        key: 'health',
        label: 'Health & wellbeing',
        area: 'life',
        classification: 'Sensitive',
        sarahMayUse: false,
        learnFromConversations: false,
        blurb: 'Optional; private by default — no inferred diagnoses.',
      },
      {
        key: 'financial',
        label: 'Financial life',
        area: 'life',
        classification: 'Sensitive',
        sarahMayUse: false,
        learnFromConversations: false,
        blurb: 'Goals and organisation — never store banking credentials.',
      },
      {
        key: 'lifestyle',
        label: 'Lifestyle & preferences',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'How you like to live, travel, eat, and spend downtime.',
      },
      {
        key: 'dates',
        label: 'Important dates & events',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Birthdays, renewals, deadlines — link to reminders when you want.',
      },
      {
        key: 'documents',
        label: 'Documents & records',
        area: 'library',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: false,
        blurb: 'Files and metadata — distinct from approved memories.',
      },
      {
        key: 'routines',
        label: 'Routines & daily life',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Schedules, habits, recurring commitments.',
      },
      {
        key: 'property',
        label: 'Property & assets',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Homes, vehicles, equipment, renewals and records.',
      },
      {
        key: 'travel',
        label: 'Travel & places',
        area: 'life',
        classification: 'Personal',
        sarahMayUse: true,
        learnFromConversations: true,
        blurb: 'Trips, destinations, passports, and travel style.',
      },
      {
        key: 'values',
        label: 'Values & principles',
        area: 'profile',
        classification: 'Private',
        sarahMayUse: false,
        learnFromConversations: false,
        blurb: 'Boundaries and philosophy — only when you choose to share.',
      },
    ],
  },

  /** @deprecated Use MOCK_MY_KNOWLEDGE.categories; kept for doc grep compatibility */
  MOCK_KNOWLEDGE: [],

  MOCK_SARAH_SUGGESTIONS: [
    'Plan my week',
    'Summarise my open chats',
    'What did I save in My Knowledge?',
    'Help me draft a message to a business',
  ],

  /** RS02 Sarah App subscription tiers (mirrors services/revenue/catalogueService.js R0). */
  MOCK_SARAH_BILLING_TIERS: [
    {
      id: 'free',
      name: 'Sarah Free',
      price: 0,
      dailyChats: 20,
      knowledgeLabel: '512 KB knowledge',
      premiumModels: false,
      current: true,
    },
    {
      id: 'plus',
      name: 'Sarah Plus',
      price: 99,
      dailyChats: 100,
      knowledgeLabel: '5 MB knowledge',
      premiumModels: true,
    },
    {
      id: 'premium',
      name: 'Sarah Premium',
      price: 199,
      dailyChats: 300,
      knowledgeLabel: '20 MB knowledge',
      premiumModels: true,
    },
    {
      id: 'ultimate',
      name: 'Sarah Ultimate',
      price: 399,
      dailyChats: 1000,
      knowledgeLabel: '100 MB knowledge',
      premiumModels: true,
    },
  ],

  MOCK_MY_SARAH_REMINDER:
    'Approve your SmileMore booking — Company Sarah is waiting for a yes or no.',

  MOCK_MY_SARAH_HISTORY: [
    { id: 'h1', title: 'Summarise my open chats', time: 'Today · 4:12 PM', threadId: 'ps-h1' },
    { id: 'h2', title: 'Plan my week around meetings', time: 'Yesterday', threadId: 'ps-h2' },
    { id: 'h3', title: 'Draft a message to Central Motors', time: 'Mon', threadId: 'ps-h3' },
  ],

  /** Personal Sarah threads (My Sarah home list + dedicated thread view). */
  MOCK_MY_SARAH_PERSONAL_THREADS: [
    {
      id: 'ps-h1',
      title: 'Summarise my open chats',
      time: 'Today · 4:12 PM',
      messages: [
        { role: 'assistant', markdown: '**Hi, I\'m Sarah.** How can I assist you today?' },
        { role: 'user', content: 'Summarise my open chats' },
        {
          role: 'assistant',
          markdown: `You have **3 active threads** right now. Here is the clearest path through them:

:::card
## Open chats snapshot

[[badge:Updated just now]]

1. **SmileMore Dental** — booking follow-up (needs your approval)
2. **Central Motors** — test drive request
3. **Green Haven Cafe** — menu question

---

**Suggested next step:** Open **Chats** and confirm or decline SmileMore first — Company Sarah is waiting.

- I can draft replies for Central Motors and Green Haven
- I can set a reminder after you approve SmileMore
:::

![Green Haven Cafe — menu inspiration](assets/discover/green-haven-hero.jpg)`,
        },
      ],
    },
    {
      id: 'ps-h2',
      title: 'Plan my week around meetings',
      time: 'Yesterday',
      messages: [
        { role: 'assistant', markdown: '**Hi, I\'m Sarah.** How can I assist you today?' },
        { role: 'user', content: 'Plan my week around meetings' },
        {
          role: 'assistant',
          markdown: `Here is a **simple week plan** around your meetings:

:::card
## Focus blocks

[[badge:Draft plan]]

1. **Tuesday AM** — deep work (no meetings)
2. **Wednesday PM** — reserve for SmileMore follow-up
3. **Thursday AM** — deep work again

---

**Principle:** protect two mornings, keep one afternoon flexible for business chats.

- Move optional calls to Tue/Thu after 2 PM
- Calendar sync + reminders land in Phase 3
:::`,
        },
      ],
    },
    {
      id: 'ps-h3',
      title: 'Draft a message to Central Motors',
      time: 'Mon',
      messages: [
        { role: 'assistant', markdown: '**Hi, I\'m Sarah.** How can I assist you today?' },
        { role: 'user', content: 'Help me draft a polished message to Central Motors about a test drive.' },
        {
          role: 'assistant',
          markdown: `Two **ready-to-send** options for Central Motors:

:::card
## Option A — friendly

Hi Central Motors — I would like to **book a test drive** this week. Do you have availability **Thu or Fri afternoon**?

---

## Option B — formal

Dear Central Motors team, I am writing to request a test drive appointment this week. Please advise available times on Thursday or Friday afternoon.

[[badge:Tap to copy in Phase 3]]
:::

- Say **shorter** or **more formal** and I will refine
- I can add your preferred vehicle model if you share it`,
        },
      ],
    },
  ],

  MOCK_DISCOVER_CATEGORIES: [
    { id: 'all', label: 'All', icon: 'grid' },
    { id: 'fitness', label: 'Fitness', icon: 'fitness' },
    { id: 'food', label: 'Food', icon: 'food' },
    { id: 'market', label: 'Market', icon: 'market' },
    { id: 'health', label: 'Health', icon: 'health' },
    { id: 'auto', label: 'Auto', icon: 'auto' },
  ],

  /**
   * SUB-01: suggested organisations for My Organisations (prototype shell) — full directory uses Discover data.
   */
  MOCK_MY_ORGANISATIONS_SUGGESTED_IDS: ['smilemore-dental', 'green-haven', 'central-motors'],

  /**
   * MW-01: My Wallet — illustrative demo (no real funds; partner integration TBD).
   */
  MOCK_MY_WALLET: {
    currency: 'ZAR',
    mandatesPaused: false,
    balances: {
      total: 15000,
      reserved: 12500,
      discretionary: 2500,
    },
    allocation: [
      { label: 'Rent', amount: 5000 },
      { label: 'Food & groceries', amount: 2500 },
      { label: 'Transport', amount: 1500 },
      { label: 'Insurance & subscriptions', amount: 1500 },
      { label: 'Savings', amount: 2000 },
    ],
    upcoming: [
      { label: 'Rent — landlord', amount: 5000, due: '1st (mandate L1)' },
      { label: 'Vehicle insurance (from org reminder)', amount: 890, due: '5th (verify mandate)' },
    ],
    pendingApproval: [
      { label: 'Online order — household', amount: 1850, meta: 'Once-off · L2 approval' },
    ],
  },

  /**
   * SYP-01: Sarah Pay — checkout shell (no camera, no real pay).
   */
  MOCK_SARAH_PAY: {
    spendingControl: {
      label: 'Tonight’s outing',
      cap: 3000,
      spent: 1950,
      mode: 'flexible',
    },
    simulatedPaymentRequest: {
      merchant: 'Neon Stone Bistro',
      branch: 'Rosebank',
      amount: 500,
      reference: 'SPY-DEMO-REQ-9f2a · verified token',
      ctaLabel: 'Pay with Sarah Pay (demo)',
    },
    chips: ['Scan & Pay', 'My purchases', 'Payment requests', 'Spending controls', 'Merchants', 'History'],
  },

  MOCK_DISCOVER_COMPANIES: [
    {
      id: 'green-haven',
      name: 'Green Haven Cafe',
      categories: ['food'],
      tags: ['cafe', 'coffee', 'vegan', 'restaurant', 'brunch', 'organic'],
      categoryLabel: 'Vegan Cafe · Organic Food',
      image: 'assets/discover/green-haven-hero.jpg',
      imageFallback: 'assets/discover/green-haven-fallback.svg',
      gallery: [
        'assets/discover/green-haven-hero.jpg',
        'assets/discover/green-haven-1.jpg',
        'assets/discover/green-haven-2.jpg',
        'assets/discover/green-haven-3.jpg',
        'assets/discover/green-haven-4.jpg',
        'assets/discover/green-haven-5.jpg',
      ],
      products: [
        {
          id: 'gh-p1',
          name: 'Oat Flat White',
          price: 42,
          image: 'assets/discover/green-haven-1.jpg',
          description: 'Barista oat milk, double shot espresso.',
        },
        {
          id: 'gh-p2',
          name: 'Rainbow Buddha Bowl',
          price: 118,
          image: 'assets/discover/green-haven-2.jpg',
          description: 'Quinoa, roasted veg, tahini drizzle.',
        },
        {
          id: 'gh-p3',
          name: 'Almond Croissant',
          price: 38,
          image: 'assets/discover/green-haven-3.jpg',
          description: 'Same-day bake, lightly sweet filling.',
        },
        {
          id: 'gh-p4',
          name: 'Cold-Press Green Juice',
          price: 55,
          image: 'assets/discover/green-haven-4.jpg',
          description: 'Celery, apple, ginger — no added sugar.',
        },
      ],
      rating: 4.5,
      reviewCount: 196,
      distanceKm: 1.9,
      featured: true,
      verified: true,
      address: 'Shop 4, 88 Jan Smuts Ave, Rosebank, Johannesburg',
      description:
        'Green Haven is a calm Rosebank favourite for plant-based plates, fair-trade coffee, and slow weekend brunches. Every dish is built from seasonal produce sourced from local growers, with clear allergen labels and a dedicated nut-free prep line. Company Sarah can answer menu questions, hold a table for your party, and share today’s chef specials without you waiting on hold. Follow the cafe to see new menu drops and community events on your Home feed. Parking is available off Jan Smuts; wheelchair access via the main entrance.',
      hours: [
        { day: 'Monday', time: '10 AM – 9 PM' },
        { day: 'Tuesday', time: '10 AM – 9 PM' },
        { day: 'Wednesday', time: '10 AM – 9 PM' },
        { day: 'Thursday', time: '10 AM – 10 PM' },
        { day: 'Friday', time: '10 AM – 10 PM' },
        { day: 'Saturday', time: '9 AM – 10 PM' },
        { day: 'Sunday', time: '9 AM – 8 PM' },
      ],
      chatId: null,
    },
    {
      id: 'smilemore-dental',
      name: 'SmileMore Dental',
      categories: ['health'],
      tags: ['dentist', 'dental', 'family', 'whitening', 'check-up'],
      categoryLabel: 'Dental · Family care',
      image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&q=80',
      avatarKey: 'smilemore',
      rating: 4.8,
      reviewCount: 312,
      distanceKm: 2.4,
      featured: true,
      verified: true,
      address: '12 Rivonia Rd, Sandton, Johannesburg',
      gallery: [
        'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80',
        'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80',
        'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&q=80',
        'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=81',
        'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=81',
        'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&q=81',
      ],
      products: [
        {
          id: 'sm-p1',
          name: 'Adult Check-up & Clean',
          price: 650,
          image: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=400&q=80',
          description: 'Exam, scale & polish with Company Sarah booking.',
        },
        {
          id: 'sm-p2',
          name: 'Take-home Whitening Kit',
          price: 899,
          image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=400&q=80',
          description: 'Custom trays plus 14-day gel supply.',
        },
        {
          id: 'sm-p3',
          name: 'Kids First Visit Package',
          price: 520,
          image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=400&q=80',
          description: 'Gentle intro visit for ages 4–10.',
        },
        {
          id: 'sm-p4',
          name: 'Night Guard Fitting',
          price: 1200,
          image: 'https://images.unsplash.com/photo-1606811978012-98898837c131?w=400&q=80',
          description: 'Impressions and fitted guard within 7 days.',
        },
      ],
      description:
        'SmileMore Dental is a modern Sandton practice focused on family care, cosmetic dentistry, and same-day emergency relief when you need it most. Our team publishes transparent pricing for check-ups, cleans, and whitening packages before you arrive. Company Sarah helps you compare slots, understand prep instructions, and approve bookings — nothing is confirmed until you tap yes. Follow us for oral-health tips, seasonal reminders, and priority access to community screening days. We accept major medical aids and offer payment plans on approved treatment plans.',
      hours: [
        { day: 'Monday', time: '8 AM – 6 PM' },
        { day: 'Tuesday', time: '8 AM – 6 PM' },
        { day: 'Wednesday', time: '8 AM – 6 PM' },
        { day: 'Thursday', time: '8 AM – 7 PM' },
        { day: 'Friday', time: '8 AM – 5 PM' },
        { day: 'Saturday', time: '9 AM – 1 PM' },
        { day: 'Sunday', time: 'Closed' },
      ],
      chatId: 'smilemore-demo',
    },
    {
      id: 'central-motors',
      name: 'Central Motors',
      categories: ['auto', 'market'],
      tags: ['car', 'dealership', 'test drive', 'pre-owned', 'finance'],
      categoryLabel: 'Automotive · Test drives',
      image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&q=80',
      avatarKey: 'centralMotors',
      rating: 4.6,
      reviewCount: 89,
      distanceKm: 3.1,
      featured: false,
      verified: true,
      address: 'Central Motors Blvd, Midrand',
      gallery: [
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80',
        'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80',
      ],
      description:
        'Central Motors is a Midrand showroom pairing new and certified pre-owned vehicles with transparent on-floor pricing and digital spec sheets for every model. Company Sarah can match you with available test-drive times, explain finance options at a high level, and queue service appointments without back-and-forth calls. Follow the dealership to see fresh arrivals, demo-day invites, and service specials on your timeline. Our floor team welcomes walk-ins, and Sarah keeps a record of your preferences for your next visit.',
      hours: [
        { day: 'Monday', time: '8 AM – 6 PM' },
        { day: 'Tuesday', time: '8 AM – 6 PM' },
        { day: 'Wednesday', time: '8 AM – 6 PM' },
        { day: 'Thursday', time: '8 AM – 6 PM' },
        { day: 'Friday', time: '8 AM – 6 PM' },
        { day: 'Saturday', time: '9 AM – 4 PM' },
        { day: 'Sunday', time: 'Closed' },
      ],
      chatId: 'central-motors',
    },
    {
      id: 'pulse-fitness',
      name: 'Pulse Fitness Studio',
      categories: ['fitness'],
      tags: ['gym', 'hiit', 'yoga', 'strength', 'classes'],
      categoryLabel: 'Fitness · Group classes',
      image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
      rating: 4.7,
      reviewCount: 142,
      distanceKm: 0.8,
      featured: true,
      verified: false,
      address: '22 Gym Lane, Rosebank',
      description: 'HIIT, yoga, and strength classes with flexible packs. Ask Sarah about intro offers.',
      hours: [
        { day: 'Monday', time: '6 AM – 9 PM' },
        { day: 'Tuesday', time: '6 AM – 9 PM' },
        { day: 'Wednesday', time: '6 AM – 9 PM' },
        { day: 'Thursday', time: '6 AM – 9 PM' },
        { day: 'Friday', time: '6 AM – 8 PM' },
        { day: 'Saturday', time: '7 AM – 6 PM' },
        { day: 'Sunday', time: '8 AM – 4 PM' },
      ],
      chatId: null,
    },
    {
      id: 'greenleaf-spa',
      name: 'GreenLeaf Spa',
      categories: ['health', 'market'],
      tags: ['spa', 'massage', 'wellness', 'facial'],
      categoryLabel: 'Wellness · Spa',
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&q=80',
      rating: 4.4,
      reviewCount: 67,
      distanceKm: 2.2,
      featured: false,
      verified: false,
      address: '5 Wellness Way, Rosebank',
      description: 'Massage, facials, and winter wellness packages. Book through Sarah App this month for member rates.',
      hours: [
        { day: 'Monday', time: '9 AM – 7 PM' },
        { day: 'Tuesday', time: '9 AM – 7 PM' },
        { day: 'Wednesday', time: '9 AM – 7 PM' },
        { day: 'Thursday', time: '9 AM – 8 PM' },
        { day: 'Friday', time: '9 AM – 8 PM' },
        { day: 'Saturday', time: '9 AM – 6 PM' },
        { day: 'Sunday', time: '10 AM – 5 PM' },
      ],
      chatId: null,
    },
    {
      id: 'city-market',
      name: 'City Fresh Market',
      categories: ['market', 'food'],
      tags: ['groceries', 'produce', 'market', 'pantry', 'ready meals'],
      categoryLabel: 'Market · Groceries',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80',
      rating: 4.3,
      reviewCount: 521,
      distanceKm: 1.2,
      featured: false,
      verified: false,
      address: '100 Main St, Johannesburg CBD',
      description: 'Local produce, pantry staples, and ready meals. Company Sarah shares weekly deals when you follow the store.',
      hours: [
        { day: 'Monday', time: '7 AM – 9 PM' },
        { day: 'Tuesday', time: '7 AM – 9 PM' },
        { day: 'Wednesday', time: '7 AM – 9 PM' },
        { day: 'Thursday', time: '7 AM – 9 PM' },
        { day: 'Friday', time: '7 AM – 10 PM' },
        { day: 'Saturday', time: '7 AM – 10 PM' },
        { day: 'Sunday', time: '8 AM – 8 PM' },
      ],
      chatId: null,
    },
    {
      id: 'quickfix-plumbing',
      name: 'QuickFix Plumbing',
      categories: ['market', 'health'],
      tags: ['plumber', 'plumbing', 'emergency', 'geyser', 'drain'],
      categoryLabel: 'Plumbing · Emergency call-outs',
      image: 'https://images.unsplash.com/photo-1585704032915-c3400ca4e3ac?w=600&q=80',
      rating: 4.5,
      reviewCount: 94,
      distanceKm: 4.2,
      featured: false,
      verified: true,
      address: '18 Industrial Rd, Randburg',
      description:
        'Licensed plumbers for burst pipes, blocked drains, geyser replacements, and after-hours emergencies across Johannesburg north. Company Sarah quotes standard call-out fees upfront and slots the next available technician. Book a leak inspection or ask about landlord compliance certificates without phone tag.',
      hours: [
        { day: 'Monday', time: '7 AM – 7 PM' },
        { day: 'Tuesday', time: '7 AM – 7 PM' },
        { day: 'Wednesday', time: '7 AM – 7 PM' },
        { day: 'Thursday', time: '7 AM – 7 PM' },
        { day: 'Friday', time: '7 AM – 7 PM' },
        { day: 'Saturday', time: '8 AM – 2 PM' },
        { day: 'Sunday', time: 'Emergency only' },
      ],
      chatId: null,
    },
    {
      id: 'neon-stone-bistro',
      name: 'Neon Stone Bistro',
      categories: ['food'],
      tags: ['restaurant', 'bistro', 'dining', 'date night', 'steak'],
      categoryLabel: 'Restaurant · Contemporary dining',
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80',
      rating: 4.6,
      reviewCount: 228,
      distanceKm: 1.5,
      featured: false,
      verified: true,
      address: 'Shop 12, Rosebank Mall, Johannesburg',
      description:
        'Neon Stone is a Rosebank bistro for wood-fired mains, small plates, and a concise wine list. Reserve through Company Sarah, browse tonight’s chef specials, or split the bill with Sarah Pay when you dine in. Follow for prix-fixe weekends and live acoustic sets.',
      hours: [
        { day: 'Monday', time: 'Closed' },
        { day: 'Tuesday', time: '12 PM – 10 PM' },
        { day: 'Wednesday', time: '12 PM – 10 PM' },
        { day: 'Thursday', time: '12 PM – 11 PM' },
        { day: 'Friday', time: '12 PM – 11 PM' },
        { day: 'Saturday', time: '11 AM – 11 PM' },
        { day: 'Sunday', time: '11 AM – 9 PM' },
      ],
      chatId: null,
    },
  ],

  MOCK_MY_SARAH_QUICK: [
    {
      id: 'q1',
      title: 'Quick insights',
      statements: [
        'Boost skills with a focused tip',
        'Try one new prompt pattern',
        'Review what worked last week',
        'Break big asks into steps',
        'Pick a habit to build this week',
      ],
      prompt: 'Give me one insight to improve how I use Sarah this week.',
      icon: 'insight',
    },
    {
      id: 'q3',
      title: 'Organise tasks',
      statements: [
        'Set clear priorities',
        "Name today's top three",
        'Group errands by area',
        'One reminder per must-do',
        'Clear finished items often',
      ],
      prompt: 'Help me organise my tasks and set priorities for tomorrow.',
      icon: 'tasks',
    },
    {
      id: 'q5',
      title: 'Use My Knowledge',
      statements: [
        'Answers from what you saved',
        'Sarah cites your saved facts',
        'Say what to add if gaps show',
        'Keep goals and dates current',
        'Check what Sarah may access',
      ],
      prompt:
        'Answer using my saved My Knowledge where you have permission. If something is missing, say what you would need me to add.',
      icon: 'knowledge',
    },
    {
      id: 'q6',
      title: 'Week ahead',
      statements: [
        'Plan days and priorities',
        'Map commitments by day',
        'Block time for deep work',
        'Leave buffer between meetings',
        'Sunday prep for Monday',
      ],
      prompt:
        "Let's look at my upcoming week. Consider saved commitments and goals where you have permission, and help me plan priorities.",
      icon: 'calendar',
    },
  ],
};

(function resolveCompanyAvatars() {
  const proto = window.SARAH_PROTOTYPE;
  const map = proto.COMPANY_AVATARS || {};
  function apply(item) {
    if (item && item.avatarKey && map[item.avatarKey]) {
      item.avatar = map[item.avatarKey];
    }
  }
  proto.MOCK_FEED.forEach(apply);
  proto.MOCK_CHATS.forEach(apply);
  apply(proto.MOCK_THREAD);
  proto.MOCK_DISCOVER_COMPANIES.forEach(apply);
})();
