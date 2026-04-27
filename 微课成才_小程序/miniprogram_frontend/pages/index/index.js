const app = getApp()

Page({
  data: {
    isProcessing: false,
    currentStep: '待机中',
    progress: 0,
    videoUrl: '',
    questions: [],
    chapters: [],
    currentQIdx: 0,
    selectedIndices: [],
    shortAnswer: '',
    engineReady: false,     // 引擎是否就绪
    engineWarming: false,   // 引擎是否正在预热
    warmupCountdown: 0      // 预热倒计时秒数
  },

  onLoad() {
    this.setData({
      videoUrl: app.globalData.serverUrl + '/video/test_video.mp4'
    })
    this.videoContext = wx.createVideoContext('myVideo')
    // 静默预热引擎（用户浏览页面时无感加载）
    this.warmupEngine()
  },

  warmupEngine() {
    const serverUrl = app.globalData.serverUrl
    // 发送 health 请求触发后端预热
    wx.request({
      url: serverUrl + '/api/health',
      success: (res) => {
        if (res.statusCode === 200 && res.data.status === 'ready') {
          // 引擎已经就绪
          this.setData({ engineReady: true, engineWarming: false })
        } else if (res.statusCode === 202) {
          // 正在预热中，显示倒计时
          this.setData({ engineWarming: true })
          this.startWarmupCountdown(40) // 预计最多 40 秒
        }
      },
      fail: () => {
        // 请求失败（如本地开发模式），忽略
      }
    })
  },

  startWarmupCountdown(seconds) {
    this.setData({ warmupCountdown: seconds })
    const timer = setInterval(() => {
      const remaining = this.data.warmupCountdown - 1
      if (remaining <= 0) {
        clearInterval(timer)
        this.setData({ warmupCountdown: 0 })
        // 检查是否就绪
        this.checkEngineReady()
        return
      }
      this.setData({ warmupCountdown: remaining })
    }, 1000)

    // 每 5 秒主动查一次状态（不等倒计时结束）
    const checkTimer = setInterval(() => {
      if (this.data.engineReady) {
        clearInterval(checkTimer)
        clearInterval(timer)
        return
      }
      this.checkEngineReady()
      if (this.data.engineReady) {
        clearInterval(timer)
        clearInterval(checkTimer)
      }
    }, 5000)
  },

  checkEngineReady() {
    wx.request({
      url: app.globalData.serverUrl + '/api/engine_status',
      success: (res) => {
        if (res.data.ready) {
          this.setData({ engineReady: true, engineWarming: false, warmupCountdown: 0 })
        }
      }
    })
  },

  startProcess() {
    // 如果引擎还没预热好，提示等待
    if (!this.data.engineReady && this.data.engineWarming) {
      wx.showModal({
        title: '炼化炉预热中',
        content: `模型正在加载，预计还需 ${this.data.warmupCountdown} 秒，请稍后再试`,
        showCancel: false
      })
      return
    }

    this.setData({ isProcessing: true })
    wx.request({
      url: app.globalData.serverUrl + '/api/start_process',
      method: 'POST',
      data: { video_name: 'test_video.mp4' },
      success: (res) => {
        if (res.data.status === 'error') {
          this.setData({ isProcessing: false })
          if (res.data.message.includes('预热')) {
            // 引擎还没好，触发预热并提示
            this.warmupEngine()
            wx.showModal({
              title: '炼化炉预热中',
              content: '首次启动需要加载 AI 模型，请等待约 30 秒后重试',
              showCancel: false
            })
          } else {
            wx.showModal({
              title: '出错了',
              content: res.data.message,
              showCancel: false
            })
          }
          return
        }
        this.pollStatus()
      },
      fail: () => {
        this.setData({ isProcessing: false })
        wx.showModal({
          title: '连接失败',
          content: '请检查网络连接，或确认后端服务正在运行',
          showCancel: false
        })
      }
    })
  },

  pollStatus() {
    const timer = setInterval(() => {
      wx.request({
        url: app.globalData.serverUrl + '/api/get_status',
        success: (res) => {
          const { current_step, progress } = res.data
          this.setData({
            currentStep: current_step,
            progress: Math.max(progress, 0) // 确保不显示负数
          })
          // 炼化完成
          if (current_step === '已完成') {
            clearInterval(timer)
            this.setData({ isProcessing: false })
            this.fetchData()
          }
          // 炼化失败
          if (progress === -1 || current_step.startsWith('炼化失败')) {
            clearInterval(timer)
            this.setData({ isProcessing: false })
            wx.showModal({
              title: '炼化失败',
              content: current_step.replace('炼化失败: ', ''),
              showCancel: false
            })
          }
        },
        fail: () => {
          clearInterval(timer)
          this.setData({ isProcessing: false })
          wx.showToast({ title: '连接断开', icon: 'none' })
        }
      })
    }, 3000)
  },

  fetchData() {
    // 1. 获取题目
    wx.request({
      url: app.globalData.serverUrl + '/api/get_questions',
      success: (res) => {
        this.setData({ questions: res.data })
      }
    })
    // 2. 获取带有时间戳的章节结构
    wx.request({
      url: app.globalData.serverUrl + '/api/get_lecture',
      success: (res) => {
        this.setData({ chapters: res.data.chapters || [] })
      }
    })
  },

  selectOption(e) {
    const { index } = e.currentTarget.dataset
    const currentQ = this.data.questions[this.data.currentQIdx]
    let { selectedIndices } = this.data

    if (currentQ.type === '单选题' || currentQ.type === '判断题') {
      this.checkAnswer([index])
    } else if (currentQ.type === '多选题') {
      const pos = selectedIndices.indexOf(index)
      if (pos > -1) {
        selectedIndices.splice(pos, 1)
      } else {
        selectedIndices.push(index)
      }
      this.setData({ selectedIndices })
    }
  },

  submitMultiAnswer() {
    this.checkAnswer(this.data.selectedIndices)
  },

  checkAnswer(indices) {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (indices.length === 0) return

    // 标准化用户答案：选择题取首字母(A/B/C/D)，判断题取选项原文(正确/错误)
    const userAns = indices.sort().map(i => {
      const opt = currentQ.options[i]
      // 判断题选项没有字母前缀，直接用原文
      if (currentQ.type === '判断题') return opt
      // 选择题选项格式如 "A. xxx"，取首字母
      return opt.charAt(0)
    })
    // 标准化正确答案为字母数组（兼容字符串 "A" 和数组 ["A","B","C"]）
    let correctAns = currentQ.answer
    if (!Array.isArray(correctAns)) {
      correctAns = [correctAns]
    }

    // 数组比较：长度一致且每个元素都匹配
    const isCorrect = userAns.length === correctAns.length &&
      userAns.every((val, idx) => val === correctAns[idx])

    if (isCorrect) {
      wx.showToast({ title: '炼化成功！', icon: 'success' })
      setTimeout(() => {
        this.setData({ 
          currentQIdx: this.data.currentQIdx + 1,
          selectedIndices: [] 
        })
      }, 1500)
    } else {
      wx.showModal({
        title: '炼化偏差',
        content: '感悟不够深刻，是否回到视频中重新研读？',
        confirmText: '看解析',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) {
            this.jumpToVideoSource()
          }
          this.setData({ selectedIndices: [] })
        }
      })
    }
  },

  onShortAnswerInput(e) {
    this.setData({ shortAnswer: e.detail.value })
  },

  submitShortAnswer() {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (!this.data.shortAnswer.trim()) return

    wx.showModal({
      title: '参考答案',
      content: currentQ.answer,
      confirmText: '下一题',
      cancelText: '看解析',
      success: (res) => {
        if (res.confirm) {
          this.setData({ 
            currentQIdx: this.data.currentQIdx + 1,
            shortAnswer: ''
          })
        } else if (res.cancel) {
          wx.showModal({
            title: '解析',
            content: currentQ['解析'] || '暂无解析',
            showCancel: false,
            success: () => {
              this.setData({ 
                currentQIdx: this.data.currentQIdx + 1,
                shortAnswer: ''
              })
            }
          })
        }
      }
    })
    this.setData({ shortAnswer: '' })
  },

  exitQuiz() {
    this.setData({
      questions: [],
      currentQIdx: 0,
      selectedIndices: [],
      shortAnswer: ''
    })
  },

  // 核心功能：跳转到视频对应章节
  jumpToVideoSource() {
    // 简单逻辑：根据题目索引估算对应的章节 (后续可优化为 AI 题目带章节 ID)
    // 目前假设 25 道题均匀分布在 5-8 个章节中
    const chapterIdx = Math.floor(this.data.currentQIdx / 4) 
    const chapter = this.data.chapters[chapterIdx]
    
    if (chapter && chapter.timestamp !== undefined) {
      wx.showToast({ title: '回溯到：' + chapter.title, icon: 'none' })
      this.videoContext.seek(chapter.timestamp)
      this.videoContext.play()
      // 自动滚屏到视频位置
      wx.pageScrollTo({ selector: '#myVideo', duration: 300 })
    } else {
      wx.showToast({ title: '该知识点暂无回溯点', icon: 'none' })
    }
  }
})