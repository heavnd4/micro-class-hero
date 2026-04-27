const app = getApp()

Page({
  data: {
    isProcessing: false,
    currentStep: '待机中',
    progress: 0,
    videoUrl: '',
    questions: [],
    chapters: [], // 新增：保存带有时间戳的章节信息
    currentQIdx: 0,
    selectedIndices: []
  },

  onLoad() {
    this.setData({
      videoUrl: app.globalData.serverUrl + '/video/test_video.mp4'
    })
    this.videoContext = wx.createVideoContext('myVideo')
  },

  startProcess() {
    this.setData({ isProcessing: true })
    wx.request({
      url: app.globalData.serverUrl + '/api/start_process',
      method: 'POST',
      data: { video_name: 'test_video.mp4' },
      success: (res) => {
        this.pollStatus()
      },
      fail: () => {
        this.setData({ isProcessing: false })
        wx.showModal({
          title: '炼化炉未点火',
          content: '请确保你电脑上的那个黑窗口（app.py）正在运行',
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
          this.setData({
            currentStep: res.data.current_step,
            progress: res.data.progress
          })
          if (res.data.current_step === '已完成') {
            clearInterval(timer)
            this.setData({ isProcessing: false })
            this.fetchData()
          }
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

    const userAns = indices.sort().map(i => currentQ.options[i].charAt(0)).join('')
    const correctAns = currentQ.answer

    if (userAns === correctAns) {
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