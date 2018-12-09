const _ = require('lodash')
const fcm = require('./firebase')

const MODES = {
  MAIN: 'MAIN',
  IN_THREAD: 'IN_THREAD'
}

const ACTIONS = {
  THREADS: 'THREADS',
  THREAD: 'THREAD',
  TYPING: 'TYPING'
}

let currentState = {
  mode: MODES.MAIN,
  currentThreads: [],
  currentThreadID: null
}

let userInfoCache = {}

const getUserInfo = (api, userID) => new Promise(async (resolve, reject) => {
  if(userInfoCache[userID]){
    return userInfoCache[userID]
  }
  let userInfo = {}
  try {
    userInfo = (await api.getUserInfo(userID))[userID]
    userInfoCache[userID] = userInfo
  } catch (error) {
    return reject(error)
  }
  return resolve(userInfo)
})

const stringifyMessage = async (api, message) => {
  if(message.type === 'message'){
    const userInfo = await getUserInfo(api, message.senderID)
    if(message.body.length === 0 && message.attachments.length > 0){
      if(message.attachments[0] && message.attachments[0].type === 'sticker'){
        return `${userInfo.name}: (sticker) ${message.attachments[0].caption || ''}`
      } else if (message.attachments[0] && message.attachments[0].type === 'animated_image'){
        return `${userInfo.name} sent a gif`
      }
      return `${userInfo.name} sent an unsupported message`
    }
    return `${userInfo.name}: ${message.body}`
  }
  if(message.type === 'event'){
    return message.snippet
  }
}

const initMessengerListener = api => {
  api.listen(async (error, newMessage) => {
    if(error) {
      console.error(error)
    }
    if(newMessage && currentState.mode === MODES.IN_THREAD && newMessage.threadID === currentState.currentThreadID){
      try {
        await fcm.promisifiedSend(await stringifyMessage(api, newMessage))
      } catch (error) {
        return console.error(error)
      }
    }
  })
}

const handleSMS = (api) => async (request, response) => {
  if(!request.body || !request.body.message){
    return response.json({
      error: 'No SMS received'
    })
  }

  const message = request.body.message

  if(message === ACTIONS.THREADS){
    let list
    try {
      list = await api.getThreadList(10, null, ["INBOX"])
    } catch (error) {
      return response.json(error)
    }
    try {
      await fcm.promisifiedSend(
        list.map(({ name, unreadCount }, i) => {
          const unreadString = unreadCount > 0 ? `(🆕 ${unreadCount})` : ''
          return (`${i} ${name} ${unreadString}`)
        }).join('\n')
      )
    } catch (error) {
      return response.json(error)
    }
    currentState.mode = MODES.MAIN
    currentState.currentThreads = list.map(({ threadID }) => threadID)
    return response.json({ action: ACTIONS.THREADS, success: true })
  } if (_.startsWith(message, ACTIONS.THREAD)){
    const [ignore, threadIndex] = message.split(' ')

    if(!currentState.currentThreads[threadIndex]){
      const threadText = typeof threadIndex === 'undefined' ? '' : ` ${threadIndex}`
      await fcm.promisifiedSend(`⚠️ Thread${threadText} not found.`)
      return response.json({
        error: 'Invalid thread index'
      })
    }

    currentState.mode = MODES.IN_THREAD
    currentState.currentThreadID = currentState.currentThreads[threadIndex]

    try {
      await fcm.promisifiedSend(`✅ Entered thread ${threadIndex}`)
      const msgHistory = await api.getThreadHistory(currentState.currentThreadID, 15)
      await api.markAsRead(currentState.currentThreadID)
      const messagesToSend = msgHistory.map(msg => stringifyMessage(api, msg))
      await fcm.promisifiedSend((await Promise.all(messagesToSend)).join('\n'))
      if(msgHistory.length === 0){
        await fcm.promisifiedSend('No new messages')
      }
    } catch (error) {
      return response.json(error)
    }

    return response.json({ action: ACTIONS.THREAD, success: true })
  } else {
    if(currentState.mode === MODES.IN_THREAD){
      if(message === ACTIONS.TYPING){
        await api.sendTypingIndicator(currentState.currentThreadID)
        return response.json({ action: ACTIONS.SEND, success: true })
      }
      try {
        await api.sendMessage(message, currentState.currentThreadID)
      } catch (error) {
        return response.json({ error: error })
      }
      return response.json({ action: ACTIONS.SEND, success: true })
    } else {
      await fcm.promisifiedSend(`ℹ️ The following commands are available:\n\nTHREADS - view all threads\nTHREAD {index} - enter particular thread`)
      return response.json({
        error: '🤔 SMS command not supported'
      })
    }
  }
}

module.exports = {
  handleSMS,
  initMessengerListener
}
