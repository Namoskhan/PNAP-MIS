const fs = require('fs');
const path = require('path');

const webFiles = {
  en: path.join(__dirname, '../web/src/i18n/locales/en.json'),
  ur: path.join(__dirname, '../web/src/i18n/locales/ur.json'),
  ps: path.join(__dirname, '../web/src/i18n/locales/ps.json'),
};

const mobileFiles = {
  en: path.join(__dirname, '../mobile/src/i18n/locales/en.json'),
  ur: path.join(__dirname, '../mobile/src/i18n/locales/ur.json'),
  ps: path.join(__dirname, '../mobile/src/i18n/locales/ps.json'),
};

// Master dictionary additions for all 3 languages
const TRANSLATIONS = {
  common: {
    en: {
      generate: "Generate",
      assignResponsibility: "Assign Responsibility",
      markDone: "Mark Done",
      downloadPdf: "Download PDF",
      downloadExcel: "Download Excel",
      exportPdf: "Download PDF",
      exportExcel: "Download Excel",
      offlineMode: "Offline Mode",
      offlineCached: "Offline (Cached)",
      notSupported: "Not Supported",
      info: "Info",
      today: "Today",
      done: "Done",
      prov: "Prov",
      dist: "Dist",
      area: "Area",
      bu: "BU",
      actions: "Actions",
      allRoles: "All Roles",
      allTiers: "All Tiers",
      close: "Close"
    },
    ur: {
      generate: "رپورٹ تیار کریں",
      assignResponsibility: "ذمہ داری سونپیں",
      markDone: "مکمل نشان زد کریں",
      downloadPdf: "پی ڈی ایف ڈاؤن لوڈ کریں",
      downloadExcel: "ایکسل ڈاؤن لوڈ کریں",
      exportPdf: "پی ڈی ایف ڈاؤن لوڈ کریں",
      exportExcel: "ایکسل ڈاؤن لوڈ کریں",
      offlineMode: "آف لائن موڈ",
      offlineCached: "آف لائن (محفوظ شدہ)",
      notSupported: "معاونت دستیاب نہیں",
      info: "معلومات",
      today: "آج",
      done: "مکمل",
      prov: "صوبہ",
      dist: "ضلع",
      area: "علاقہ",
      bu: "بنیادی یونٹ",
      actions: "اقدامات",
      allRoles: "تمام عہدے",
      allTiers: "تمام سطحیں",
      close: "بند کریں"
    },
    ps: {
      generate: "راپور جوړ کړئ",
      assignResponsibility: "مسؤلیت وسپارئ",
      markDone: "بشپړ شو",
      downloadPdf: "پی ډي ایف ډاونلوډ",
      downloadExcel: "ایکسل ډاونلوډ",
      exportPdf: "پی ډي ایف ډاونلوډ",
      exportExcel: "ایکسل ډاونلوډ",
      offlineMode: "آفلاین اکر",
      offlineCached: "آفلاین (ساتل شوی)",
      notSupported: "ملاتړ نه کېږي",
      info: "معلومات",
      today: "نن",
      done: "بشپړ",
      prov: "صوبه",
      dist: "ضلع",
      area: "علاقه",
      bu: "بنسټیز یونټ",
      actions: "کړنې",
      allRoles: "ټولې دندې",
      allTiers: "ټولې کچې",
      close: "بندول"
    }
  },

  dashboard: {
    en: {
      commandCenter: "Command Center",
      membersAndUnits: "Members and units",
      comparison: "comparison",
      newAndActiveMembers: "New and active members",
      campaigns: "Campaigns",
      needsAttention: "Needs attention",
      totalMembers: "Total members",
      joinedInThe: "joined in the",
      inactive: "inactive",
      lastDays: "last {{days}} days",
      standingLead: "How big is the organization, right now.",
      drillHint: "Click a name to view details.",
      subordinateRecords: "Records from units that belong to your unit.",
      meetingsLead: "See planned and completed meetings by level, group and year.",
      needsAttentionLead: "See inactive units and the officers in charge.",
      live: "Live"
    },
    ur: {
      commandCenter: "کمانڈ سینٹر",
      membersAndUnits: "اراکین اور یونٹس",
      comparison: "موازنہ",
      newAndActiveMembers: "نئے اور فعال اراکین",
      campaigns: "مہمات",
      needsAttention: "توجہ طلب",
      totalMembers: "کل اراکین",
      joinedInThe: "شمولیت اختیار کی",
      inactive: "غیر فعال",
      lastDays: "گزشتہ {{days}} دن",
      standingLead: "تنظیم کا موجودہ حجم اور اراکین کی تعداد۔",
      drillHint: "تفصیلات دیکھنے کے لیے نام پر کلک کریں۔",
      subordinateRecords: "آپ کے ماتحت یونٹس کے کوائف و ریکارڈز۔",
      meetingsLead: "سطح، گروپ اور سال کے لحاظ سے منصوبہ بند اور مکمل شدہ اجلاس دیکھیں۔",
      needsAttentionLead: "غیر فعال یونٹس اور متعلقہ عہدیداران کو دیکھیں۔",
      live: "براہ راست (لائیو)"
    },
    ps: {
      commandCenter: "کمانډ سنټر",
      membersAndUnits: "غړي او څانګې (یونټونه)",
      comparison: "پرتله",
      newAndActiveMembers: "نوي او فعال غړي",
      campaigns: "کمپاینونه",
      needsAttention: "پاملرنې ته اړتیا",
      totalMembers: "ټول غړي",
      joinedInThe: "ګډون کړی په",
      inactive: "غیر فعال",
      lastDays: "وروستۍ {{days}} ورځې",
      standingLead: "د ګوند اوسنی غړیتوب او جوړښت.",
      drillHint: "د تفصیالتو د لیدو لپاره نوم کلیک کړئ.",
      subordinateRecords: "د هغو څانګو کوایف چې ستاسو تر لاس لاندې دي.",
      meetingsLead: "پلان شوې او بشپړې شوې غونډې د کچې او کال له مخې ووینئ.",
      needsAttentionLead: "غیر فعالې څانګې او مسؤل کسان وڅارئ.",
      live: "ژوندی (لایف)"
    }
  },

  commandCenter: {
    en: {
      title: "Command Center",
      theWholeCountry: "the whole country",
      totalMembers: "Total members",
      joinedInThe: "joined in the",
      newIn: "new in",
      comparison: "comparison",
      subordinateRecords: "Records from units that belong to your unit.",
      drillHint: "Click a name to view details.",
      backToProvinces: "Back to all provinces",
      allProvinces: "All provinces",
      past1Year: "Past 1 year",
      pastDays: "Past {{days}} days",
      hideFilters: "Hide filters",
      showFilters: "Show filters",
      reset: "Reset",
      activePercent: "{{pct}}% functioning",
      activeOfTotal: "{{active}} of {{total}} units functioning",
      activeInactive: "{{active}} functioning · {{inactive}} inactive",
      membersAndUnits: "Members and units",
      newAndActiveMembers: "New and active members",
      campaigns: "Campaigns",
      needsAttention: "Needs attention"
    },
    ur: {
      title: "کمانڈ سینٹر",
      theWholeCountry: "پورے ملک میں",
      totalMembers: "کل اراکین",
      joinedInThe: "شمولیت اختیار کی",
      newIn: "نئے برائے",
      comparison: "موازنہ",
      subordinateRecords: "آپ کے ماتحت یونٹس کے ریکارڈز۔",
      drillHint: "تفصیلات دیکھنے کے لیے نام پر کلک کریں۔",
      backToProvinces: "تمام صوبوں پر واپس جائیں",
      allProvinces: "تمام صوبے",
      past1Year: "گزشتہ 1 سال",
      pastDays: "گزشتہ {{days}} دن",
      hideFilters: "فلٹرز چھپائیں",
      showFilters: "فلٹرز دکھائیں",
      reset: "ری سیٹ",
      activePercent: "{{pct}}% فعال",
      activeOfTotal: "{{total}} میں سے {{active}} یونٹس فعال ہیں",
      activeInactive: "{{active}} فعال · {{inactive}} غیر فعال",
      membersAndUnits: "اراکین اور یونٹس",
      newAndActiveMembers: "نئے اور فعال اراکین",
      campaigns: "مہمات",
      needsAttention: "توجہ طلب"
    },
    ps: {
      title: "کمانډ سنټر",
      theWholeCountry: "ټول هېواد",
      totalMembers: "ټول غړي",
      joinedInThe: "ګډون کړی په",
      newIn: "نوي په",
      comparison: "پرتله",
      subordinateRecords: "ستاسو د اړوندو څانګو کوایف.",
      drillHint: "د تفصیالتو د لیدلو لپاره پر نوم کلیک وکړئ.",
      backToProvinces: "ټولو صوبو ته ستنېدل",
      allProvinces: "ټولې صوبې",
      past1Year: "تېره ۱ کال",
      pastDays: "تېرې {{days}} ورځې",
      hideFilters: "فلټرونه پټ کړئ",
      showFilters: "فلټرونه ښکاره کړئ",
      reset: "بیا تنظیم",
      activePercent: "{{pct}}% فعال",
      activeOfTotal: "له {{total}} څانګو څخه {{active}} فعالې دي",
      activeInactive: "{{active}} فعالې · {{inactive}} غیر فعالې",
      membersAndUnits: "غړي او څانګې (یونټونه)",
      newAndActiveMembers: "نوي او فعال غړي",
      campaigns: "کمپاینونه",
      needsAttention: "پاملرنې ته اړتیا"
    }
  },

  committee: {
    en: {
      label_area: "Elaqayi Committee",
      label_district: "Zilla Committee",
      label_province: "Sobayi Committee",
      label_central: "Central Committee",
      heading_area: "Elaqayi Executive Cabinet",
      heading_district: "Zilla Cabinet (District Executive)",
      heading_province: "Sobayi Cabinet (Province Executive)",
      heading_central: "Central Executive Cabinet",
      subheading_area: "Basic Unit Secretaries & Senior Mawin Secretaries",
      subheading_district: "Area Secretaries & Senior Mawin Secretaries",
      subheading_province: "District Secretaries & Senior Mawin Secretaries",
      subheading_central: "Provincial Presidents & General/First Secretaries"
    },
    ur: {
      label_area: "علاقائی کمیٹی",
      label_district: "ضلعی کمیٹی",
      label_province: "صوبائی کمیٹی",
      label_central: "مرکزی کمیٹی",
      heading_area: "علاقائی انتظامی کابینہ",
      heading_district: "ضلعی کابینہ (ضلعی ایگزیکٹو)",
      heading_province: "صوبائی کابینہ (صوبائی ایگزیکٹو)",
      heading_central: "مرکزی انتظامی کابینہ",
      subheading_area: "بنیادی یونٹ کے سیکرٹریز اور سینئر معاون سیکرٹریز",
      subheading_district: "علاقہ سیکرٹریز اور سینئر معاون سیکرٹریز",
      subheading_province: "ضلعی سیکرٹریز اور سینئر معاون سیکرٹریز",
      subheading_central: "صوبائی صدور اور جنرل / اول سیکرٹریز"
    },
    ps: {
      label_area: "علاقائي کمېټه",
      label_district: "ضلعي کمېټه",
      label_province: "صوبايي کمېټه",
      label_central: "مرکزي کمېټه",
      heading_area: "علاقائي اجرائي کابینه",
      heading_district: "ضلعي کابینه (ضلعي اجرائيه)",
      heading_province: "صوبايي کابینه (صوبايي اجرائيه)",
      heading_central: "مرکزي اجرائي کابینه",
      subheading_area: "د بنسټیزو یونټونو سکرتران او مرستیال سکرتران",
      subheading_district: "د علاقو سکرتران او مرستیال سکرتران",
      subheading_province: "د ضلعو سکرتران او مرستیال سکرتران",
      subheading_central: "صوبايي مشران او عمومي سکرتران"
    }
  },

  announcements: {
    en: {
      pinnedAnnouncement: "Pinned Announcement",
      pinned: "Pinned",
      pinToTop: "Pin to top"
    },
    ur: {
      pinnedAnnouncement: "پن کردہ اہم اعلان",
      pinned: "پن کردہ",
      pinToTop: "سب سے اوپر پن کریں"
    },
    ps: {
      pinnedAnnouncement: "ځانګړی / پین شوی خبرتیا",
      pinned: "پین شوی",
      pinToTop: "سر ته پین کول"
    }
  },

  responsibilities: {
    en: {
      assignResponsibility: "+ Assign Responsibility",
      assignBtn: "Assign Responsibility",
      assign: "Assign",
      markDone: "Mark Done",
      responsibilities: "Responsibilities",
      responsibilitiesUpper: "RESPONSIBILITIES",
      assignModalTitle: "Assign a responsibility",
      assignToMember: "Assign to Member",
      assignTo: "Assign to",
      titlePlaceholder: "e.g. Mobilize voters in Block 4",
      allStates: "All states",
      start: "Start",
      inProgress: "In Progress",
      due: "Due",
      dueDate: "Due date",
      noResponsibilities: "No responsibilities yet",
      completionNotePrompt: "Completion note (optional):"
    },
    ur: {
      assignResponsibility: "+ ذمہ داری تفویض کریں",
      assignBtn: "ذمہ داری سونپیں",
      assign: "تفویض کریں",
      markDone: "مکمل نشان زد کریں",
      responsibilities: "ذمہ داریاں",
      responsibilitiesUpper: "ذمہ داریاں",
      assignModalTitle: "ذمہ داری سونپیں",
      assignToMember: "رکن کو سونپیں",
      assignTo: "کس کو سونپیں",
      titlePlaceholder: "مثلاً بلاک 4 میں ووٹرز کو منظم کرنا",
      allStates: "تمام حالتیں",
      start: "شروع کریں",
      inProgress: "جاری ہے",
      due: "آخری تاریخ",
      dueDate: "آخری تاریخ",
      noResponsibilities: "ابھی تک کوئی ذمہ داری تفویض نہیں ہوئی",
      completionNotePrompt: "تکمیل کا نوٹ (اختیاری):"
    },
    ps: {
      assignResponsibility: "+ مسؤلیت وسپارئ",
      assignBtn: "مسؤلیت وسپارئ",
      assign: "سپارل",
      markDone: "بشپړ شو",
      responsibilities: "مسؤلیتونه",
      responsibilitiesUpper: "مسؤلیتونه",
      assignModalTitle: "مسؤلیت سپارل",
      assignToMember: "غړي ته مسؤلیت سپارل",
      assignTo: "چا ته وسپارل شي",
      titlePlaceholder: "مثلاً په څلورم بلاک کې د غړو چمتو کول",
      allStates: "ټول حالتونه",
      start: "پیل کړئ",
      inProgress: "روان",
      due: "ټاکلې نېټه",
      dueDate: "پای نېټه",
      noResponsibilities: "تر اوسه هیڅ مسؤلیت نشته",
      completionNotePrompt: "د بشپړېدو یادښت (اختیاري):"
    }
  },

  reports: {
    en: {
      generateReport: "Generate Report",
      selectMember: "Select Member",
      searchMemberPlaceholder: "Search by name, member ID, CNIC...",
      noEligibleMembers: "No eligible members found",
      activeTier: "Active Tier",
      unitLabel: "Unit",
      switchUnitContext: "Switch Unit Context",
      hideUnitSwitcher: "Hide Unit Switcher",
      aggregated: "Aggregated",
      aggregatedSub: "Include all subordinate units roll-up",
      directUnitRecords: "Direct unit records"
    },
    ur: {
      generateReport: "رپورٹ تیار کریں",
      selectMember: "رکن کا انتخاب کریں",
      searchMemberPlaceholder: "نام، ممبر آئی ڈی یا شناختی کارڈ نمبر سے تلاش کریں…",
      noEligibleMembers: "کوئی اہل رکن نہیں ملا",
      activeTier: "فعال سطح",
      unitLabel: "یونٹ",
      switchUnitContext: "یونٹ تبدیل کریں",
      hideUnitSwitcher: "یونٹ سوئچر چھپائیں",
      aggregated: "مجموعی (رول اپ)",
      aggregatedSub: "تمام ماتحت یونٹس کا مجموعی ریکارڈ شامل ہے",
      directUnitRecords: "صرف براہ راست یونٹ کے ریکارڈز"
    },
    ps: {
      generateReport: "راپور جوړ کړئ",
      selectMember: "غړی وټاکئ",
      searchMemberPlaceholder: "د نوم، غړیتوب آی ډي یا تذکرې له مخې لټول…",
      noEligibleMembers: "کوم وړ غړی ونه موندل شو",
      activeTier: "فعاله کچه",
      unitLabel: "څانګه (یونټ)",
      switchUnitContext: "د یونټ بدلون",
      hideUnitSwitcher: "یونټ بدلونکی پټ کړئ",
      aggregated: "مجموعي (ټولګړی)",
      aggregatedSub: "د ټولو ماتحتو څانګو مجموعي معلومات",
      directUnitRecords: "یوازې د دې یونټ مستقیم معلومات"
    }
  },

  performance: {
    en: {
      memberPerformance: "Member Performance",
      selectUnitContextFirst: "Select a unit context first.",
      member: "Member",
      pickMember: "— pick a member —",
      generate: "Generate Report"
    },
    ur: {
      memberPerformance: "رکن کی کارکردگی",
      selectUnitContextFirst: "پہلے یونٹ کے سیاق کا انتخاب کریں۔",
      member: "رکن",
      pickMember: "— رکن کا انتخاب کریں —",
      generate: "رپورٹ تیار کریں"
    },
    ps: {
      memberPerformance: "د غړي کارکړنه",
      selectUnitContextFirst: "لومړی د څانګې سیاق وټاکئ.",
      member: "غړی",
      pickMember: "— یو غړی وټاکئ —",
      generate: "راپور جوړ کړئ"
    }
  },

  roles: {
    en: {
      ALL: "All Roles",
      all: "All Roles",
      allRoles: "All Roles",
      GENERAL_SECRETARY: "General Secretary",
      PRESIDENT: "President / Saddar",
      SECRETARY: "Secretary",
      SENIOR_MAWIN: "Senior Mawin Secretary",
      FINANCE_SECRETARY: "Finance Secretary",
      SR_VICE_PRESIDENT: "Sr. Vice President",
      VICE_PRESIDENT: "Vice President",
      CHAIRMAN: "Chairman",
      CO_CHAIRMAN: "Co-Chairman",
      FIRST_SECRETARY: "First Secretary",
      OTHER: "Other Cabinet Roles",
      otherCabinetRoles: "Other Cabinet Roles",
      NO_ROLE: "General Workers (No Role)",
      generalWorkers: "General Workers (No Role)",
      generalWorkersNoRole: "General Workers (No Role)",
      rolesList: "Roles:"
    },
    ur: {
      ALL: "تمام عہدے",
      all: "تمام عہدے",
      allRoles: "تمام عہدے",
      GENERAL_SECRETARY: "جنرل سیکرٹری",
      PRESIDENT: "صدر",
      SECRETARY: "سیکرٹری",
      SENIOR_MAWIN: "سینئر معاون سیکرٹری",
      FINANCE_SECRETARY: "فنانس سیکرٹری",
      SR_VICE_PRESIDENT: "سینئر نائب صدر",
      VICE_PRESIDENT: "نائب صدر",
      CHAIRMAN: "چیئرمین",
      CO_CHAIRMAN: "کو چیئرمین",
      FIRST_SECRETARY: "فرسٹ سیکرٹری",
      OTHER: "دیگر کابینہ عہدے",
      otherCabinetRoles: "دیگر کابینہ عہدے",
      NO_ROLE: "عام کارکنان (بغیر عہدہ)",
      generalWorkers: "عام کارکنان (بغیر عہدہ)",
      generalWorkersNoRole: "عام کارکنان (بغیر عہدہ)",
      rolesList: "عہدے:"
    },
    ps: {
      ALL: "ټولې دندې",
      all: "ټولې دندې",
      allRoles: "ټولې دندې",
      GENERAL_SECRETARY: "عمومي سکرتر",
      PRESIDENT: "مشر / صدر",
      SECRETARY: "سکرتر",
      SENIOR_MAWIN: "مشر مرستیال سکرتر",
      FINANCE_SECRETARY: "مالي سکرتر",
      SR_VICE_PRESIDENT: "لومړی مرستیال مشر",
      VICE_PRESIDENT: "مرستیال مشر",
      CHAIRMAN: "چیرمین",
      CO_CHAIRMAN: "مرستیال چیرمین",
      FIRST_SECRETARY: "لومړی سکرتر",
      OTHER: "د کابینې نورې دندې",
      otherCabinetRoles: "د کابینې نورې دندې",
      NO_ROLE: "عام ګوندي کارکوونکي (بې دندې)",
      generalWorkers: "عام ګوندي کارکوونکي (بې دندې)",
      generalWorkersNoRole: "عام ګوندي کارکوونکي (بې دندې)",
      rolesList: "دندې:"
    }
  },

  units: {
    en: {
      central: "Central",
      province: "Province",
      district: "District",
      area: "Area",
      basic_unit: "Basic Unit",
      basicUnit: "Basic Unit",
      CENTRAL: "Central Tier",
      PROVINCE: "Province Tier",
      DISTRICT: "District Tier",
      AREA: "Area Tier",
      BASIC_UNIT: "Basic Unit Tier",
      allTiers: "All Tiers",
      centralTier: "Central Tier",
      provinceTier: "Province Tier",
      districtTier: "District Tier",
      areaTier: "Area Tier",
      basicUnitTier: "Basic Unit Tier",
      elaqayiCommittee: "Elaqayi Committee",
      zillaCommittee: "Zilla Committee",
      sobayiCommittee: "Sobayi Committee",
      centralCommittee: "Central Committee",
      nationalCongress: "National Congress",
      qomiJirga: "National / Qomi Jirga",
      sobayiJirga: "Sobayi Jirga"
    },
    ur: {
      central: "مرکزی",
      province: "صوبہ",
      district: "ضلع",
      area: "علاقہ",
      basic_unit: "بنیادی یونٹ",
      basicUnit: "بنیادی یونٹ",
      CENTRAL: "مرکزی سطح",
      PROVINCE: "صوبائی سطح",
      DISTRICT: "ضلعی سطح",
      AREA: "علاقائی سطح",
      BASIC_UNIT: "بنیادی یونٹ سطح",
      allTiers: "تمام سطحیں",
      centralTier: "مرکزی سطح",
      provinceTier: "صوبائی سطح",
      districtTier: "ضلعی سطح",
      areaTier: "علاقائی سطح",
      basicUnitTier: "بنیادی یونٹ سطح",
      elaqayiCommittee: "علاقائی کمیٹی",
      zillaCommittee: "ضلعی کمیٹی",
      sobayiCommittee: "صوبائی کمیٹی",
      centralCommittee: "مرکزی کمیٹی",
      nationalCongress: "قومی کانگریس",
      qomiJirga: "قومی جرگہ",
      sobayiJirga: "صوبائی جرگہ"
    },
    ps: {
      central: "مرکزي",
      province: "صوبه",
      district: "ضلع",
      area: "علاقه",
      basic_unit: "بنیادي یونټ",
      basicUnit: "بنیادي یونټ",
      CENTRAL: "مرکزي کچه",
      PROVINCE: "صوبايي کچه",
      DISTRICT: "ضلعي کچه",
      AREA: "علاقايي کچه",
      BASIC_UNIT: "بنسټیزه کچه",
      allTiers: "ټولې کچې",
      centralTier: "مرکزي کچه",
      provinceTier: "صوبايي کچه",
      districtTier: "ضلعي کچه",
      areaTier: "علاقايي کچه",
      basicUnitTier: "بنسټیزه کچه",
      elaqayiCommittee: "علاقايي کمېټه",
      zillaCommittee: "ضلعي کمېټه",
      sobayiCommittee: "صوبايي کمېټه",
      centralCommittee: "مرکزي کمېټه",
      nationalCongress: "قومي کانګرس",
      qomiJirga: "قومي جرګه",
      sobayiJirga: "صوبايي جرګه"
    }
  },

  congress: {
    en: {
      calendar: "Congress calendar",
      calendarDesc: "Meetings are grouped from one Congress date to the next. The latest group runs from the most recent Congress to today.",
      addCongress: "Add Congress",
      labelPlaceholder: "e.g. 5th National Congress",
      heldOn: "Held on",
      save: "Save",
      cancel: "Cancel",
      noCongressesYet: "No congress dates recorded yet.",
      noDatesAdded: "No Congress dates added yet. Add two dates to see meetings between them.",
      deleteConfirm: "Delete congress \"{{label}}\"?",
      congress: "Congress",
      removeTooltip: "Remove from the calendar",
      congressAdded: "Congress \"{{label}}\" added.",
      couldNotAddCongress: "Could not add congress",
      congressUpdated: "Congress \"{{label}}\" updated.",
      couldNotUpdateCongress: "Could not update congress",
      congressRemoved: "Congress \"{{label}}\" removed.",
      couldNotRemoveCongress: "Could not remove congress"
    },
    ur: {
      calendar: "کانگریس کا کیلنڈر",
      calendarDesc: "اجلاس ایک کانگریس کی تاریخ سے اگلی تاریخ تک مرتب کیے جاتے ہیں۔ تازہ ترین مدت حالیہ کانگریس سے آج تک شمار ہوتی ہے۔",
      addCongress: "کانگریس شامل کریں",
      labelPlaceholder: "مثلاً پانچویں قومی کانگریس",
      heldOn: "منعقد ہوئی بتاریخ",
      save: "محفوظ کریں",
      cancel: "منسوخ",
      noCongressesYet: "ابھی تک کانگریس کی کوئی تاریخ درج نہیں کی گئی۔",
      noDatesAdded: "ابھی تک کانگریس کی کوئی تاریخ شامل نہیں کی گئی۔ اجلاس دیکھنے کے لیے کم از کم دو تاریخیں شامل کریں۔",
      deleteConfirm: "کیا آپ واقعی کانگریس \"{{label}}\" حذف کرنا چاہتے ہیں؟",
      congress: "کانگریس",
      removeTooltip: "کیلنڈر سے حذف کریں",
      congressAdded: "کانگریس \"{{label}}\" شامل کر دی گئی۔",
      couldNotAddCongress: "کانگریس شامل نہیں کی جا سکی",
      congressUpdated: "کانگریس \"{{label}}\" کی تفصیلات اپ ڈیٹ ہو گئیں۔",
      couldNotUpdateCongress: "کانگریس اپ ڈیٹ نہیں کی جا سکی",
      congressRemoved: "کانگریس \"{{label}}\" حذف کر دی گئی۔",
      couldNotRemoveCongress: "کانگریس حذف نہیں کی جا سکی"
    },
    ps: {
      calendar: "د کانګرس کلیز / تقویم",
      calendarDesc: "غونډې له یوه کانګرس څخه بل پورې وېشل کېږي. وروستۍ برخه له وروستي کانګرس څخه تر نن ورځې پورې دوام لري.",
      addCongress: "کانګرس زیاتول",
      labelPlaceholder: "مثلاً پنځم قومي کانګرس",
      heldOn: "جوړ شوی پر",
      save: "خوندي کول",
      cancel: "لغوه",
      noCongressesYet: "تر اوسه د کوم کانګرس تاریخ نه دی ثبت شوی.",
      noDatesAdded: "تر اوسه د کانګرس کومه نېټه نه ده ثبت شوې. د غونډو د لیدلو لپاره دوه نېټې اضافه کړئ.",
      deleteConfirm: "ایا غواړئ کانګرس \"{{label}}\" حذف کړئ؟",
      congress: "کانګرس",
      removeTooltip: "له تقویم څخه لرې کول",
      congressAdded: "کانګرس \"{{label}}\" اضافه شو.",
      couldNotAddCongress: "کانګرس اضافه نه شو",
      congressUpdated: "د کانګرس \"{{label}}\" معلومات تازه شول.",
      couldNotUpdateCongress: "کانګرس تازه نه شو",
      congressRemoved: "کانګرس \"{{label}}\" لرې شو.",
      couldNotRemoveCongress: "کانګرس لرې نه شو"
    }
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function processFiles(filesMap, name) {
  for (const lang of ['en', 'ur', 'ps']) {
    const fPath = filesMap[lang];
    if (!fs.existsSync(fPath)) {
      console.log(`File not found: ${fPath}`);
      continue;
    }
    const raw = fs.readFileSync(fPath, 'utf8');
    const json = JSON.parse(raw);

    for (const [section, langObj] of Object.entries(TRANSLATIONS)) {
      if (langObj[lang]) {
        if (!json[section]) json[section] = {};
        deepMerge(json[section], langObj[lang]);
      }
    }

    fs.writeFileSync(fPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`[UPDATED] ${name} ${lang}: ${fPath}`);
  }
}

console.log('--- SYNCING LOCALES ---');
processFiles(webFiles, 'WEB');
processFiles(mobileFiles, 'MOBILE');
console.log('Done syncing locales!');
