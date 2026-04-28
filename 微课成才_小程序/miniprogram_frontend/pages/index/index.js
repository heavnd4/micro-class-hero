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
    warmupCountdown: 0,     // 预热倒计时秒数
    debugMode: false        // 调试模式（跳题按钮 + 秒过）
  },

  onLoad() {
    this.videoContext = wx.createVideoContext('myVideo')
    this.loadVideoUrl()
    // 静默预热引擎（用户浏览页面时无感加载）
    this.warmupEngine()
    // 继承 debugMode
    this.setData({ debugMode: app.globalData.debugMode })
  },

  loadVideoUrl() {
    if (app.globalData.localMode) {
      this.setData({ videoUrl: app.globalData.localServerUrl + '/video/test_video.mp4' })
    } else {
      // 云托管模式：通过 callContainer 调后端接口获取 COS 临时链接
      app.api('/api/get_video_url?video=test_video.mp4').then(res => {
        if (res.statusCode === 200 && res.data.url) {
          this.setData({ videoUrl: res.data.url })
        } else {
          console.log('获取视频链接失败:', res.data)
        }
      }).catch(err => {
        console.log('获取视频链接失败:', err)
      })
    }
  },

  warmupEngine() {
    // 发送 health 请求触发后端预热
    app.api('/api/health').then(res => {
      if (res.statusCode === 200 && res.data.status === 'ready') {
        this.setData({ engineReady: true, engineWarming: false })
      } else if (res.statusCode === 202) {
        this.setData({ engineWarming: true })
        this.startWarmupCountdown(40)
      }
    }).catch(() => {
      // 请求失败，忽略
    })
  },

  startWarmupCountdown(seconds) {
    this.setData({ warmupCountdown: seconds })
    const timer = setInterval(() => {
      const remaining = this.data.warmupCountdown - 1
      if (remaining <= 0) {
        clearInterval(timer)
        this.setData({ warmupCountdown: 0 })
        this.checkEngineReady()
        return
      }
      this.setData({ warmupCountdown: remaining })
    }, 1000)

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
    app.api('/api/engine_status').then(res => {
      if (res.data.ready) {
        this.setData({ engineReady: true, engineWarming: false, warmupCountdown: 0 })
      }
    })
  },

  startProcess() {
    if (!this.data.engineReady && this.data.engineWarming) {
      wx.showModal({
        title: '炼化炉预热中',
        content: `模型正在加载，预计还需 ${this.data.warmupCountdown} 秒，请稍后再试`,
        showCancel: false
      })
      return
    }

    this.setData({ isProcessing: true })
    app.api('/api/start_process', {
      method: 'POST',
      data: { video_name: 'test_video.mp4' }
    }).then(res => {
      if (res.data.status === 'error') {
        this.setData({ isProcessing: false })
        if (res.data.message.includes('预热')) {
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
    }).catch(() => {
      this.setData({ isProcessing: false })
      wx.showModal({
        title: '连接失败',
        content: '请检查网络连接，或确认后端服务正在运行',
        showCancel: false
      })
    })
  },

  pollStatus() {
    const timer = setInterval(() => {
      app.api('/api/get_status').then(res => {
        const { current_step, progress } = res.data
        this.setData({
          currentStep: current_step,
          progress: Math.max(progress, 0)
        })
        if (current_step === '已完成') {
          clearInterval(timer)
          this.setData({ isProcessing: false })
          this.fetchData()
        }
        if (progress === -1 || current_step.startsWith('炼化失败')) {
          clearInterval(timer)
          this.setData({ isProcessing: false })
          wx.showModal({
            title: '炼化失败',
            content: current_step.replace('炼化失败: ', ''),
            showCancel: false
          })
        }
      }).catch(() => {
        clearInterval(timer)
        this.setData({ isProcessing: false })
        wx.showToast({ title: '连接断开', icon: 'none' })
      })
    }, 3000)
  },

  fetchData() {
    app.api('/api/get_questions').then(res => {
      this.setData({ questions: res.data })
    })
    app.api('/api/get_lecture').then(res => {
      this.setData({ chapters: res.data.chapters || [] })
    })
  },

  selectOption(e) {
    const { index } = e.currentTarget.dataset
    const currentQ = this.data.questions[this.data.currentQIdx]
    let { selectedIndices } = this.data

    if (currentQ.type === '单选题' || currentQ.type === '判断题') {
      // 调试模式：直接跳下一题，不做对错判断
      if (this.data.debugMode) {
        this.setData({ currentQIdx: this.data.currentQIdx + 1, selectedIndices: [] })
        return
      }
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
    // 调试模式：直接跳下一题
    if (this.data.debugMode) {
      this.setData({ currentQIdx: this.data.currentQIdx + 1, selectedIndices: [] })
      return
    }
    this.checkAnswer(this.data.selectedIndices)
  },

  checkAnswer(indices) {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (indices.length === 0) return

    const userAns = indices.sort().map(i => {
      const opt = currentQ.options[i]
      if (currentQ.type === '判断题') return opt
      return opt.charAt(0)
    })
    let correctAns = currentQ.answer
    if (!Array.isArray(correctAns)) {
      correctAns = [correctAns]
    }

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
    // 调试模式：自动填入内容后直接显示参考答案跳下一题
    if (this.data.debugMode) {
      wx.showModal({
        title: '参考答案',
        content: currentQ.answer,
        confirmText: '下一题',
        showCancel: false,
        success: () => {
          this.setData({ currentQIdx: this.data.currentQIdx + 1, shortAnswer: '' })
        }
      })
      this.setData({ shortAnswer: '' })
      return
    }
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

  // ===== 调试模式：跳题功能 =====

  // 跳到指定题型的第一道题（从当前位置往后找）
  skipToType(e) {
    const { type } = e.currentTarget.dataset
    const questions = this.data.questions
    for (let i = this.data.currentQIdx; i < questions.length; i++) {
      if (questions[i].type === type) {
        this.setData({ currentQIdx: i, selectedIndices: [], shortAnswer: '' })
        return
      }
    }
    wx.showToast({ title: '后面没有该题型了', icon: 'none' })
  },

  // 跳到最后一道题（通常测试简答题）
  skipToLast() {
    const lastIdx = this.data.questions.length - 1
    this.setData({ currentQIdx: lastIdx, selectedIndices: [], shortAnswer: '' })
  },

  // 跳到第N题（直接输入序号）
  skipToQuestion() {
    const total = this.data.questions.length
    wx.showActionSheet({
      itemList: Array.from({ length: total }, (_, i) => `第 ${i + 1} 题 (${this.data.questions[i].type})`),
      success: (res) => {
        this.setData({ currentQIdx: res.tapIndex, selectedIndices: [], shortAnswer: '' })
      }
    })
  },

  jumpToVideoSource() {
    const chapterIdx = Math.floor(this.data.currentQIdx / 4) 
    const chapter = this.data.chapters[chapterIdx]
    
    if (chapter && chapter.timestamp !== undefined) {
      wx.showToast({ title: '回溯到：' + chapter.title, icon: 'none' })
      this.videoContext.seek(chapter.timestamp)
      this.videoContext.play()
      wx.pageScrollTo({ selector: '#myVideo', duration: 300 })
    } else {
      wx.showToast({ title: '该知识点暂无回溯点', icon: 'none' })
    }
  }
})
