import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const MAX_ARTICLE_SESSIONS = 16
export const TOPIC_PAGE_SIZE = 6
const TOPIC_STATUS_PRIORITY = {
  pending: 0,
  'in-progress': 1,
  completed: 2,
}

export const TOPIC_LIBRARY_PEN_NAMES = ['芷若', '明远']

const TOPIC_REASON_BY_THEME = {
  做人处世智慧: {
    A型: '适合从处世分寸和人情边界切入，写出克制但有后劲的提醒。',
    B型: '适合做清单式提醒，观点明确，读者容易代入和转发。',
  },
  家庭关系: {
    A型: '适合落到家庭相处的具体处境里，写出细腻克制的情感余味。',
    B型: '适合用清单结构拆开家庭关系难题，表达更直接也更有执行感。',
  },
  晚年自处: {
    A型: '适合写晚年自处的安静、清醒和放下，文字容易沉下来。',
    B型: '适合把晚年自处的话题讲得更明确，利于提炼可执行的提醒。',
  },
  孝道与父母: {
    A型: '适合从父母与子女的细节处境切入，不说教也能打动人。',
    B型: '适合将孝道主题拆成明确的三点提醒，便于收藏和转发。',
  },
  健康与生命: {
    A型: '适合从身心状态和生命感受切入，写出有体温的提醒。',
    B型: '适合将健康主题写成清单结构，观点更清楚，也更利于传播。',
  },
}

function createImportedTopicReason(topic) {
  return (
    TOPIC_REASON_BY_THEME[topic.theme]?.[topic.type] ??
    (topic.type === 'B型'
      ? '适合用清单结构展开观点，表达更直接，也更利于收藏转发。'
      : '适合从具体处境切入，写出更细腻克制的情绪和回味。')
  )
}

const BASE_CONTENT_TOPIC_LIBRARY = [
  {
    id: 'library-topic-01',
    title: '真正有分寸的人，往往守住了这3条处世边界',
    type: 'A型',
    penName: '芷若',
    reason: '适合从普通人的处境切入，写出细腻但有后劲的人情道理。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-02',
    title: '婚姻走到后半程，女人最该守住的3件事',
    type: 'B型',
    penName: '明远',
    reason: '适合落到家庭关系里的现实处境，清单式表达更有执行感。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-03',
    title: '人到晚年才明白，日子过稳了，靠的是这3种心态',
    type: 'A型',
    penName: '芷若',
    reason: '适合讲晚年自处的清醒和温柔，读者容易读出余味。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-04',
    title: '父母慢慢老去后，子女最不能忽视的3件事',
    type: 'B型',
    penName: '明远',
    reason: '切中孝道与父母这个母题，适合做明确的提醒型内容。',
    theme: '孝道与父母',
  },
  {
    id: 'library-topic-05',
    title: '一个人到了这个年纪，最该放在心上的3条养生道理',
    type: 'B型',
    penName: '明远',
    reason: '健康与生命类内容适合用清单结构，读者容易收藏转发。',
    theme: '健康与生命',
  },
  {
    id: 'library-topic-06',
    title: '真正聪明的人，到了一定年纪都会慢慢收住这3种脾气',
    type: 'B型',
    penName: '明远',
    reason: '适合落到处世分寸和情绪管理，容易写出有现实感的提醒。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-07',
    title: '真正靠谱的人，往往在这3件小事上看得出分寸',
    type: 'B型',
    penName: '明远',
    reason: '做人处世智慧类母题，适合写成有力度的三点式文章。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-08',
    title: '一个家能不能走长久，多半要看这3个地方有没有守住',
    type: 'B型',
    penName: '明远',
    reason: '家庭关系母题下，清单型更适合给出明确抓手。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-09',
    title: '人老了以后，最难得的不是热闹，而是守住这份清静',
    type: 'A型',
    penName: '芷若',
    reason: '晚年自处适合芷若的温柔叙述，容易写出安静的回味。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-10',
    title: '等父母老了以后，真正见孝心的，往往是这3件小事',
    type: 'B型',
    penName: '明远',
    reason: '孝道母题下，清单结构清楚，适合落到具体行动。',
    theme: '孝道与父母',
  },
  {
    id: 'library-topic-11',
    title: '一个人下半生最值钱的，不是存款，而是这3样东西',
    type: 'B型',
    penName: '明远',
    reason: '健康与生命母题可以延展到身心状态和生命质量，适合实用表达。',
    theme: '健康与生命',
  },
  {
    id: 'library-topic-12',
    title: '到了晚年以后，最能护住一个人的，往往是这3份清醒',
    type: 'A型',
    penName: '芷若',
    reason: '适合写晚年自处的安静和通透，文字更容易沉下来。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-13',
    title: '人情走到最后才懂，真正有格局的人守的是这3件事',
    type: 'B型',
    penName: '明远',
    reason: '做人处世类内容，明远的力度和清单结构更容易讲透。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-14',
    title: '一个家想过得安稳，夫妻之间最好别丢了这3样东西',
    type: 'B型',
    penName: '明远',
    reason: '家庭关系里适合写清单式提醒，现实感更强。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-15',
    title: '到了晚年以后，人最该看开的，不是得失，而是这件事',
    type: 'A型',
    penName: '芷若',
    reason: '晚年自处适合以故事和余味收束，芷若更贴近这个母题。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-16',
    title: '对父母最深的亏欠，往往不是没钱，而是晚了这3步',
    type: 'B型',
    penName: '明远',
    reason: '孝道题适合写成明确的三点提醒，便于直达读者心里。',
    theme: '孝道与父母',
  },
  {
    id: 'library-topic-17',
    title: '人过五十后才知道，真正保命的，是这3个生活习惯',
    type: 'B型',
    penName: '明远',
    reason: '健康与生命母题适合做收藏型内容，结构清楚，传播性更好。',
    theme: '健康与生命',
  },
  {
    id: 'library-topic-18',
    title: '一个家庭真正的福气，不是热闹，而是把这3件事过顺了',
    type: 'B型',
    penName: '明远',
    reason: '适合家庭关系主题，表达上能兼顾温度和明确的现实抓手。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-19',
    title: '真正有教养的人，从不在这3件事上让人难堪',
    type: 'B型',
    penName: '明远',
    reason: '适合写人情边界和分寸感，标题抓力强，也利于转发。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-20',
    title: '女人到了中年，最该远离的不是忙，而是这3种消耗',
    type: 'B型',
    penName: '明远',
    reason: '适合女性情感和自我消耗主题，容易形成共鸣。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-21',
    title: '晚年最好的活法，不是合群，而是把这3件事想明白',
    type: 'A型',
    penName: '芷若',
    reason: '更适合写通透和自处，语气可以安静但有后劲。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-22',
    title: '父母老了以后，真正让人心酸的，常常不是贫穷而是这件事',
    type: 'A型',
    penName: '芷若',
    reason: '适合从细节入手写孝道，不需要很重的说教也能动人。',
    theme: '孝道与父母',
  },
  {
    id: 'library-topic-23',
    title: '到了这个年纪，最该逼自己养成的，是这3个保命习惯',
    type: 'B型',
    penName: '明远',
    reason: '健康主题做成明确清单，更适合收藏和二次传播。',
    theme: '健康与生命',
  },
  {
    id: 'library-topic-24',
    title: '人这一生真正的体面，往往藏在这3次不争里',
    type: 'A型',
    penName: '芷若',
    reason: '适合做处世主题的克制表达，文风可以沉一点。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-25',
    title: '夫妻过到最后，比爱更重要的，其实是这3种能力',
    type: 'B型',
    penName: '明远',
    reason: '家庭关系里适合写现实层面的经营感，读者会更容易代入。',
    theme: '家庭关系',
  },
  {
    id: 'library-topic-26',
    title: '人老了以后，慢慢把这3样东西放下，日子反而顺了',
    type: 'A型',
    penName: '芷若',
    reason: '适合晚年自处主题，整体更偏安静和清醒的风格。',
    theme: '晚年自处',
  },
  {
    id: 'library-topic-27',
    title: '真正懂孝顺的人，不会只在父母生病时才想起这3件事',
    type: 'B型',
    penName: '明远',
    reason: '孝道题更适合落到日常行动和情感亏欠上，容易打动人。',
    theme: '孝道与父母',
  },
  {
    id: 'library-topic-28',
    title: '五十岁以后，最好的养生，不是补，而是先停掉这3种习惯',
    type: 'B型',
    penName: '明远',
    reason: '适合健康主题的反常识切口，读者会更愿意点开。',
    theme: '健康与生命',
  },
  {
    id: 'library-topic-29',
    title: '一个人真正成熟的开始，是学会在这3件事上闭嘴',
    type: 'B型',
    penName: '明远',
    reason: '处世边界和语言分寸都是高频话题，容易写出力度。',
    theme: '做人处世智慧',
  },
  {
    id: 'library-topic-30',
    title: '到了中晚年，一个家最怕的，不是没钱，而是丢了这3样东西',
    type: 'B型',
    penName: '明远',
    reason: '适合家庭关系和晚年处境的结合题，读者接受度高。',
    theme: '家庭关系',
  },
]

const IMPORTED_TOPIC_LIBRARY_V1 = [
  { title: '管住嘴，是一个人最大的修养', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '熟人面前，这3句话说了就后悔', type: 'B型', penName: '明远', theme: '做人处世智慧' },
  { title: '人越老越要少说话，话多是祸根', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '借钱这件事，聪明人只说这3句', type: 'B型', penName: '明远', theme: '做人处世智慧' },
  { title: '沉默，是成年人最好的回答', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '人到中年，学会认输才是赢', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '格局大的人，从不计较这3件事', type: 'B型', penName: '明远', theme: '做人处世智慧' },
  { title: '不争不抢的人，往往活得最好', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '看一个人的层次，就看他怎么对待比自己弱的人', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '人活到一定年纪，才明白：不解释，是最高级的回应', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '越是计较的人，越过不好', type: 'A型', penName: '芷若', theme: '做人处世智慧' },
  { title: '放下面子，才能捡起尊严', type: 'A型', penName: '明远', theme: '做人处世智慧' },
  { title: '软弱换不来尊重，挺直腰杆做人', type: 'A型', penName: '明远', theme: '做人处世智慧' },
  { title: '人性就是欺软怕硬，别让人看轻你', type: 'A型', penName: '明远', theme: '做人处世智慧' },
  { title: '越是好说话，越容易被人欺负', type: 'A型', penName: '明远', theme: '做人处世智慧' },
  { title: '真正有底气的人，从不证明自己', type: 'A型', penName: '明远', theme: '做人处世智慧' },
  { title: '人这一辈子，最值得守住的是这3条底线', type: 'B型', penName: '明远', theme: '做人处世智慧' },
  { title: '婚姻里最大的悲哀，是两个人各过各的', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '男人扛起责任，才是一个家的脊梁', type: 'A型', penName: '明远', theme: '家庭关系' },
  { title: '女人情绪稳，家就安', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '夫妻吵了一辈子，才明白吵架是最蠢的事', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '老伴走后，很多人才懂得那个最烦的人最爱自己', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '婚姻不是爱情，是两个人合伙过日子', type: 'A型', penName: '明远', theme: '家庭关系' },
  { title: '被宠一辈子的女人，身上都有这3个特点', type: 'B型', penName: '芷若', theme: '家庭关系' },
  { title: '一个家过得好不好，看这3件事就知道了', type: 'B型', penName: '明远', theme: '家庭关系' },
  { title: '夫妻之间，最怕这种沉默', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '父母最大的失败，是把孩子养成了仇人', type: 'A型', penName: '明远', theme: '家庭关系' },
  { title: '人到五六十岁，才真正理解了父母', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '哪怕再孝顺，年过75的父母这几件事别做', type: 'B型', penName: '明远', theme: '家庭关系' },
  { title: '父母的晚年，最怕这3件事', type: 'B型', penName: '明远', theme: '家庭关系' },
  { title: '孩子长大了，父母该学会放手', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '父母与子女，终究是一场渐行渐远的缘分', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '有一种伤，叫父母不被子女理解', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '亲家之间，走得越近越容易生嫌隙', type: 'A型', penName: '明远', theme: '家庭关系' },
  { title: '聪明的亲家，都懂得这3条边界', type: 'B型', penName: '明远', theme: '家庭关系' },
  { title: '亲家相处，牢记这3个不', type: 'B型', penName: '明远', theme: '家庭关系' },
  { title: '嫁给老实人的女人，中年以后才明白这是什么感觉', type: 'A型', penName: '芷若', theme: '家庭关系' },
  { title: '人到晚年，手机安静了，才是真正的开始', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '退休后，那些把日子过好的人，都做了同一件事', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '一个人独处的能力，决定晚年的质量', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '人越老，越要学会享受孤独', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '真正活明白的人，都在做减法', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '人生下半场，最重要的是做减法', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '那些关系断了就断了，不必强留', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '老了才明白，有些人不值得你惦记', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '人到晚年，圈子小了，心反而静了', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '放下那些消耗你的人，才能活得轻松', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '老了不求人，才是最大的体面', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '手里有钱，腰杆才硬', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '老年人最大的悲哀，是把希望全寄托在子女身上', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '晚年过得好的人，都守住了这一点', type: 'A型', penName: '明远', theme: '晚年自处' },
  { title: '人老了，最该为自己活', type: 'A型', penName: '芷若', theme: '晚年自处' },
  { title: '父母在，人生尚有来处', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '子女不回家，父母最心寒的不是孤独，是这件事', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '真正的孝顺，不是给钱，是这3件事', type: 'B型', penName: '明远', theme: '孝道与父母' },
  { title: '父母老了，最需要的不是补品，是这个', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '一个残忍的真相：很多子女对父母越来越冷漠', type: 'A型', penName: '明远', theme: '孝道与父母' },
  { title: '父母最后的体面，需要子女来守护', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '不要等父母走了，才想起那些没说出口的话', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '有一种孝顺，叫不给父母添麻烦', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '做父母的，把这3件事想明白，晚年才踏实', type: 'B型', penName: '明远', theme: '孝道与父母' },
  { title: '父母心里最放不下的，不是钱，是这件事', type: 'A型', penName: '芷若', theme: '孝道与父母' },
  { title: '人活多久，看睡觉就知道了', type: 'B型', penName: '明远', theme: '健康与生命' },
  { title: '老了才明白，伤身体最快的不是熬夜，是这个', type: 'A型', penName: '明远', theme: '健康与生命' },
  { title: '晚年最大的财富，不是钱，是这副身体', type: 'A型', penName: '明远', theme: '健康与生命' },
  { title: '人到六十，把这3件事放下，身体才会好', type: 'B型', penName: '明远', theme: '健康与生命' },
  { title: '情绪是最贵的药，也是最毒的毒', type: 'A型', penName: '芷若', theme: '健康与生命' },
  { title: '好好睡觉，是对自己最大的善待', type: 'A型', penName: '芷若', theme: '健康与生命' },
  { title: '人这一生，最值得投资的只有健康', type: 'A型', penName: '明远', theme: '健康与生命' },
]

export const CONTENT_TOPIC_LIBRARY = [
  ...BASE_CONTENT_TOPIC_LIBRARY,
  ...IMPORTED_TOPIC_LIBRARY_V1.map((topic, index) => ({
    id: `library-topic-${String(BASE_CONTENT_TOPIC_LIBRARY.length + index + 1).padStart(2, '0')}`,
    reason: createImportedTopicReason(topic),
    ...topic,
  })),
]

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTopicFilterTypes(filterTypes = []) {
  if (!Array.isArray(filterTypes)) {
    return []
  }

  return Array.from(new Set(filterTypes.filter((penName) => TOPIC_LIBRARY_PEN_NAMES.includes(penName)))).slice(0, 1)
}

export function getTopicById(topicId) {
  if (typeof topicId !== 'string' || !topicId.trim()) {
    return null
  }

  return CONTENT_TOPIC_LIBRARY.find((topic) => topic.id === topicId) ?? null
}

export function getTopicStatusMap(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {}
  }

  return sessions.reduce((statusMap, session) => {
    const topicId =
      typeof session?.topicSelection?.selectedTopicId === 'string'
        ? session.topicSelection.selectedTopicId
        : typeof session?.topicSelection?.selectedTopic?.id === 'string'
          ? session.topicSelection.selectedTopic.id
          : ''

    if (!topicId) {
      return statusMap
    }

    const nextStatus = session?.stageId === 'completed' ? 'completed' : 'in-progress'
    const currentStatus = statusMap[topicId] ?? 'pending'

    if (TOPIC_STATUS_PRIORITY[nextStatus] > TOPIC_STATUS_PRIORITY[currentStatus]) {
      statusMap[topicId] = nextStatus
    }

    return statusMap
  }, {})
}

function resolveExcludedTopicIds({ excludeSessionId = null, sessions = [] } = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return new Set()
  }

  return sessions.reduce((excludedTopicIds, session) => {
    if (!session || session.id === excludeSessionId) {
      return excludedTopicIds
    }

    const topicId =
      typeof session?.topicSelection?.selectedTopicId === 'string'
        ? session.topicSelection.selectedTopicId
        : typeof session?.topicSelection?.selectedTopic?.id === 'string'
          ? session.topicSelection.selectedTopic.id
          : ''

    if (topicId) {
      excludedTopicIds.add(topicId)
    }

    return excludedTopicIds
  }, new Set())
}

export function getFilteredTopicLibrary(filterTypes = [], options = {}) {
  const normalizedTypes = normalizeTopicFilterTypes(filterTypes)
  const excludedTopicIds = resolveExcludedTopicIds(options)

  const filteredTopics =
    normalizedTypes.length === 0
      ? CONTENT_TOPIC_LIBRARY
      : CONTENT_TOPIC_LIBRARY.filter((topic) => normalizedTypes.includes(topic.penName))

  if (excludedTopicIds.size === 0) {
    return filteredTopics
  }

  return filteredTopics.filter((topic) => !excludedTopicIds.has(topic.id))
}

export function getTopicRecommendationPageCount(filterTypes = [], options = {}) {
  const filteredTopics = getFilteredTopicLibrary(filterTypes, options)

  return Math.max(1, Math.ceil(filteredTopics.length / TOPIC_PAGE_SIZE))
}

export function createTopicRecommendations({ filterTypes = [], pageIndex = 0, ...options } = {}) {
  const filteredTopics = getFilteredTopicLibrary(filterTypes, options)
  const pageCount = getTopicRecommendationPageCount(filterTypes, options)
  const safePageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1)
  const startIndex = safePageIndex * TOPIC_PAGE_SIZE

  return filteredTopics.slice(startIndex, startIndex + TOPIC_PAGE_SIZE)
}

function createRandomTopicPageIndex(filterTypes = [], options = {}) {
  const filteredTopics = getFilteredTopicLibrary(filterTypes, options)

  if (filteredTopics.length === 0) {
    return 0
  }

  const pageCount = getTopicRecommendationPageCount(filterTypes, options)
  return Math.floor(Math.random() * pageCount)
}

function createInitialMessages() {
  return [
    {
      id: createId('assistant'),
      role: 'assistant',
      content:
        '我先从选题库里随机准备了 6 个推荐选题。你可以直接选择，也可以通过筛选切换不同作者署名。',
      createdAt: new Date().toISOString(),
    },
  ]
}

function createSessionTitle(index = 1) {
  return `新的文章 ${index}`
}

function createSession(index = 1, options = {}) {
  const now = new Date().toISOString()
  const pageIndex = createRandomTopicPageIndex([], options)

  return {
    id: createId('content-session'),
    title: createSessionTitle(index),
    createdAt: now,
    updatedAt: now,
    draft: '',
    deepThinkingEnabled: true,
    stageId: 'topic',
    isWorkbenchOpen: false,
    activeWorkbenchTab: 'draft',
    messages: createInitialMessages(),
    topicSelection: {
      filterTypes: [],
      isRefreshingRecommendations: false,
      pageIndex,
      recommendationError: '',
      recommendations: createTopicRecommendations({ pageIndex, ...options }),
      selectedTopicId: null,
      selectedTopic: null,
      source: 'preset',
    },
    draftReview: {
      activeVersionId: null,
      latestNote: '',
      versions: [],
    },
    imageSelection: {
      matchedAt: null,
      referenceAssets: [],
      sourceVersionId: null,
      slots: [],
    },
    layoutReview: {
      device: 'mobile',
      fontSize: 'medium',
    },
    draftSync: {
      attemptCount: 0,
      error: '',
      lastSyncedAt: null,
      mediaId: '',
      provider: '',
      status: 'idle',
      summary: null,
    },
    runLogs: [],
    processingFlow: null,
    lastFlowSummary: null,
  }
}

function ensureSessionsShape(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []

  if (sessions.length === 0) {
    const initialSession = createSession(1)

    return {
      activeSessionId: initialSession.id,
      isSidebarCollapsed: false,
      sessions: [initialSession],
    }
  }

  const normalizedSessions = sessions.map((session, index) => {
    const fallbackSession = createSession(index + 1, { excludeSessionId: session?.id, sessions })
    const normalizedFilterTypes = normalizeTopicFilterTypes(session?.topicSelection?.filterTypes)
    const pageCount = getTopicRecommendationPageCount(normalizedFilterTypes, {
      excludeSessionId: session?.id,
      sessions,
    })
    const normalizedPageIndex =
      typeof session?.topicSelection?.pageIndex === 'number' && session.topicSelection.pageIndex >= 0
        ? Math.min(session.topicSelection.pageIndex, pageCount - 1)
        : fallbackSession.topicSelection.pageIndex
    const fallbackRecommendations = createTopicRecommendations({
      filterTypes: normalizedFilterTypes,
      pageIndex: normalizedPageIndex,
      excludeSessionId: session?.id,
      sessions,
    })
    const currentRecommendations = Array.isArray(session?.topicSelection?.recommendations)
      ? session.topicSelection.recommendations
      : []
    const normalizedRecommendations = currentRecommendations.length > 0 ? currentRecommendations : fallbackRecommendations
    const normalizedStageId =
      session?.stageId === 'images'
        ? 'preview'
        : session?.stageId === 'sync'
          ? 'completed'
          : typeof session?.stageId === 'string'
            ? session.stageId
            : 'topic'
    const normalizedWorkbenchTab =
      session?.activeWorkbenchTab === 'images' || session?.activeWorkbenchTab === 'sync'
        ? 'preview'
        : session?.activeWorkbenchTab === 'logs'
          ? 'draft'
          : typeof session?.activeWorkbenchTab === 'string'
            ? session.activeWorkbenchTab
            : 'draft'

    return {
      ...fallbackSession,
      ...session,
      title:
        typeof session?.title === 'string' && session.title.trim().length > 0
          ? session.title
          : fallbackSession.title,
      draft: typeof session?.draft === 'string' ? session.draft : '',
      deepThinkingEnabled: session?.deepThinkingEnabled ?? true,
      isWorkbenchOpen: Boolean(session?.isWorkbenchOpen),
      activeWorkbenchTab: normalizedWorkbenchTab,
      stageId: normalizedStageId,
      messages: Array.isArray(session?.messages) && session.messages.length > 0 ? session.messages : fallbackSession.messages,
      topicSelection: {
        ...fallbackSession.topicSelection,
        ...(session?.topicSelection ?? {}),
        filterTypes: normalizedFilterTypes,
        pageIndex: normalizedPageIndex,
        recommendations: normalizedRecommendations.length > 0 ? normalizedRecommendations : fallbackRecommendations,
        selectedTopic:
          session?.topicSelection?.selectedTopic ??
          getTopicById(session?.topicSelection?.selectedTopicId) ??
          fallbackSession.topicSelection.selectedTopic,
        recommendationError:
          typeof session?.topicSelection?.recommendationError === 'string' ? session.topicSelection.recommendationError : '',
        source:
          session?.topicSelection?.source === 'ai' || session?.topicSelection?.source === 'custom'
            ? session.topicSelection.source
            : 'preset',
      },
      draftReview: {
        ...fallbackSession.draftReview,
        ...(session?.draftReview ?? {}),
        versions:
          Array.isArray(session?.draftReview?.versions) ? session.draftReview.versions : fallbackSession.draftReview.versions,
      },
      imageSelection: {
        ...fallbackSession.imageSelection,
        ...(session?.imageSelection ?? {}),
        matchedAt:
          typeof session?.imageSelection?.matchedAt === 'string' && session.imageSelection.matchedAt.trim()
            ? session.imageSelection.matchedAt.trim()
            : null,
        referenceAssets:
          Array.isArray(session?.imageSelection?.referenceAssets) ? session.imageSelection.referenceAssets : [],
        sourceVersionId:
          typeof session?.imageSelection?.sourceVersionId === 'string' && session.imageSelection.sourceVersionId.trim()
            ? session.imageSelection.sourceVersionId.trim()
            : null,
        slots: Array.isArray(session?.imageSelection?.slots) ? session.imageSelection.slots : [],
      },
      layoutReview: {
        ...fallbackSession.layoutReview,
        ...(session?.layoutReview ?? {}),
      },
      draftSync: {
        ...fallbackSession.draftSync,
        ...(session?.draftSync ?? {}),
      },
      runLogs: Array.isArray(session?.runLogs) ? session.runLogs : [],
    }
  })

  const sessionIds = new Set(normalizedSessions.map((session) => session.id))
  const activeSessionId =
    typeof state?.activeSessionId === 'string' && sessionIds.has(state.activeSessionId)
      ? state.activeSessionId
      : normalizedSessions[0].id

  return {
    activeSessionId,
    isSidebarCollapsed: Boolean(state?.isSidebarCollapsed),
    sessions: normalizedSessions.slice(0, MAX_ARTICLE_SESSIONS),
  }
}

function createPersistableBenchmarkState(state) {
  return {
    activeSessionId: state.activeSessionId,
    isSidebarCollapsed: state.isSidebarCollapsed,
    sessions: state.sessions,
  }
}

export const useBenchmarkStore = create(
  persist(
    (set, get) => {
      const initialSession = createSession(1)

      return {
        activeSessionId: initialSession.id,
        isSidebarCollapsed: false,
        sessions: [initialSession],
        createSession: () => {
          const nextSession = createSession(get().sessions.length + 1, { sessions: get().sessions })

          set((state) => ({
            activeSessionId: nextSession.id,
            sessions: [nextSession, ...state.sessions].slice(0, MAX_ARTICLE_SESSIONS),
          }))

          return nextSession.id
        },
        deleteSession: (sessionId) => {
          let nextActiveSessionId = null

          set((state) => {
            const nextSessions = state.sessions.filter((session) => session.id !== sessionId)

            if (nextSessions.length === 0) {
              const replacementSession = createSession(1)
              nextActiveSessionId = replacementSession.id

              return {
                activeSessionId: replacementSession.id,
                sessions: [replacementSession],
              }
            }

            const fallbackActiveSessionId =
              state.activeSessionId === sessionId
                ? nextSessions[0].id
                : state.activeSessionId

            nextActiveSessionId = fallbackActiveSessionId

            return {
              activeSessionId: fallbackActiveSessionId,
              sessions: nextSessions,
            }
          })

          return nextActiveSessionId
        },
        setActiveSessionId: (sessionId) =>
          set((state) => {
            if (!state.sessions.some((session) => session.id === sessionId)) {
              return state
            }

            return { activeSessionId: sessionId }
          }),
        setSidebarCollapsed: (nextValue) =>
          set(() => ({
            isSidebarCollapsed: Boolean(nextValue),
          })),
        resetAllSessions: () => {
          const replacementSession = createSession(1)

          set(() => ({
            activeSessionId: replacementSession.id,
            sessions: [replacementSession],
          }))

          return replacementSession.id
        },
        hydrateFromPersistedSnapshot: (snapshot) =>
          set(() => ({
            ...ensureSessionsShape(snapshot),
          })),
        updateSession: (sessionId, updater) =>
          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== sessionId) {
                return session
              }

              const nextSession =
                typeof updater === 'function' ? updater(session) : { ...session, ...updater }

              return {
                ...session,
                ...nextSession,
                updatedAt: new Date().toISOString(),
              }
            }),
          })),
      }
    },
    {
      name: 'content-creation-sessions-v1',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => createPersistableBenchmarkState(state),
      migrate: (persistedState) => ensureSessionsShape(persistedState),
    },
  ),
)

export { createPersistableBenchmarkState }
