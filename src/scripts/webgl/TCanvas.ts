import * as THREE from 'three'
import { gl } from './core/WebGL'
import { controls } from './utils/OrbitControls'
import { Assets, loadAssets } from './utils/assetLoader'
import { gsap } from 'gsap'
import GUI from 'lil-gui'

export class TCanvas {
  private readonly WALKER_LENGTH = 25
  private walkers = new THREE.Group()
  private gui = new GUI()

  private assets: Assets = {
    envMap: { path: 'images/blocky_photo_studio_1k.hdr' },
  }

  constructor(private container: HTMLElement) {
    loadAssets(this.assets).then(() => {
      this.init()
      this.initWalkers()
      this.createLights()
      this.createShadowProjectionMesh()
      this.createGuideLines(10)
      gl.requestAnimationFrame(this.anime)
    })
  }

  private init() {
    gl.setup(this.container)
    gl.scene.background = new THREE.Color('#fff')
    gl.camera.position.set(0, 0, 18)

    const axesHelper = new THREE.AxesHelper(1)
    gl.scene.add(axesHelper)
    axesHelper.visible = false

    gl.setStats(this.container)
    gl.visibleStats = false

    this.gui.close()
    this.gui.add(axesHelper, 'visible').name('axes helper')
    const obj = { stats: false }
    this.gui.add(obj, 'stats').onChange((value: boolean) => {
      gl.visibleStats = value
    })
  }

  private initWalkers() {
    gl.scene.add(this.walkers)

    const lines: { start: THREE.Vector3; end: THREE.Vector3 }[] = [
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(1, 0, 0) },
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, 1, 0) },
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, 0, 1) },
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(-1, 0, 0) },
      // { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, -1, 0) },
    ]

    const material = new THREE.MeshStandardMaterial({
      color: '#fff',
      envMap: this.assets.envMap.data as THREE.Texture,
      envMapIntensity: 0.5,
      metalness: 1,
      roughness: 0.2,
    })

    lines.forEach((line) => {
      const walker = new THREE.Group()
      const block = this.createBlock(line.start, line.end, material)
      walker.add(block)
      walker.userData = { material, currentIndex: 0, readyScaleAnimation: true }
      this.walkers.add(walker)
    })
  }

  private createLights() {
    const ambientLight = new THREE.AmbientLight('#fff', 0.2)
    gl.scene.add(ambientLight)

    const pointLight = new THREE.PointLight('#888', 0.15)
    pointLight.castShadow = true
    pointLight.shadow.mapSize.set(2048, 20248)
    gl.scene.add(pointLight)

    const pointLight2 = new THREE.PointLight('#fff', 0.7)
    gl.scene.add(pointLight2)
  }

  private createShadowProjectionMesh() {
    const geometry = new THREE.SphereGeometry(1, 128, 64)
    const material = new THREE.MeshStandardMaterial({ side: THREE.BackSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.scale.multiplyScalar(15)
    gl.scene.add(mesh)
  }

  private createBlock(start: THREE.Vector3, end: THREE.Vector3, material: THREE.Material) {
    let size = 0.08
    let scale = 0.000001
    const geometry = new THREE.BoxGeometry(size, size, 1 + size)
    const mat4 = new THREE.Matrix4()
    const dummy = new THREE.Matrix4()
    mat4.multiply(dummy.makeTranslation(0, 0, (geometry.parameters.depth - size) / 2 - (geometry.parameters.depth / 2) * (1 - scale)))
    mat4.multiply(dummy.makeScale(1, 1, scale))
    geometry.applyMatrix4(mat4)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true

    mesh.position.copy(start)
    mesh.lookAt(end)
    mesh.userData = { start, end, mat4, scale }

    return mesh
  }

  private updateBlock(block: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    block.position.copy(start)
    block.lookAt(end)
    block.userData.start = start
    block.userData.end = end
  }

  updateBlockScale(block: THREE.Mesh, scale: number, direction: 'forward' | 'backward') {
    const geo = block.geometry as THREE.BoxGeometry

    let mat4 = block.userData.mat4 as THREE.Matrix4
    geo.applyMatrix4(mat4.invert())
    mat4 = new THREE.Matrix4()

    const dummy = new THREE.Matrix4()
    mat4.multiply(dummy.makeTranslation(0, 0, (geo.parameters.depth - 0.08) / 2 - (geo.parameters.depth / 2) * (1 - scale)))
    mat4.multiply(dummy.makeScale(1, 1, scale))
    geo.applyMatrix4(mat4)
    block.userData.mat4 = mat4

    if (direction === 'forward') {
      block.position.copy(block.userData.start)
      block.lookAt(block.userData.end)
    } else {
      block.position.copy(block.userData.end)
      block.lookAt(block.userData.start)
    }
  }

  private calcEnd(walker: THREE.Group, prevEnd: THREE.Vector3) {
    const end = new THREE.Vector3()
    let not = true
    let loop = 0
    while (not) {
      end.copy(prevEnd)

      const r = Math.random() * 6
      if (r < 1) end.add(new THREE.Vector3(1, 0, 0))
      else if (r < 2) end.add(new THREE.Vector3(-1, 0, 0))
      else if (r < 3) end.add(new THREE.Vector3(0, 1, 0))
      else if (r < 4) end.add(new THREE.Vector3(0, -1, 0))
      else if (r < 5) end.add(new THREE.Vector3(0, 0, 1))
      else if (r < 6) end.add(new THREE.Vector3(0, 0, -1))

      // 範囲外からは出ないようにする。絶対にだ
      if (5 < Math.abs(end.x) || 5 < Math.abs(end.y) || 5 < Math.abs(end.z)) continue

      if (10 < loop) {
        break
      } else {
        not = walker.children.some((child) => end.equals(child.userData.end))
        loop++
      }
    }
    return end
  }

  private createGuideLines(grid: number) {
    const spread = Math.trunc(grid / 2)

    const material = new THREE.LineBasicMaterial({
      color: '#000',
      transparent: true,
      opacity: 0.1,
    })

    const points = []
    for (let x = -spread; x <= spread; x++) {
      for (let y = -spread; y <= spread; y++) {
        points.push(x, y, -spread)
        points.push(x, y, spread)
      }
    }
    for (let x = -spread; x <= spread; x++) {
      for (let z = -spread; z <= spread; z++) {
        points.push(x, -spread, z)
        points.push(x, spread, z)
      }
    }
    for (let y = -spread; y <= spread; y++) {
      for (let z = -spread; z <= spread; z++) {
        points.push(-spread, y, z)
        points.push(spread, y, z)
      }
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    const line = new THREE.LineSegments(geometry, material)
    line.visible = false
    gl.scene.add(line)

    this.gui.add(line, 'visible').name('guide line')
  }

  // ----------------------------------
  // animation
  private walk(walker: THREE.Group) {
    if (!walker.userData.readyScaleAnimation) return

    walker.userData.readyScaleAnimation = false
    const forwardBlock = walker.children[walker.children.length - 1] as THREE.Mesh

    if (walker.children.length < this.WALKER_LENGTH) {
      gsap.to(forwardBlock.userData, {
        scale: 1,
        duration: 0.1,
        ease: 'none',
        onUpdate: () => this.updateBlockScale(forwardBlock, forwardBlock.userData.scale, 'forward'),
        onComplete: () => {
          const prevEnd = forwardBlock.userData.end
          const end = this.calcEnd(walker, prevEnd)
          const block = this.createBlock(prevEnd, end, walker.userData.material)
          walker.add(block)
          walker.userData.readyScaleAnimation = true
        },
      })
    } else {
      const backwardIndex = walker.userData.currentIndex
      const fowardIndex = 0 < backwardIndex ? backwardIndex - 1 : walker.children.length - 1
      const forwardBlock = walker.children[fowardIndex] as THREE.Mesh
      const backwardBlock = walker.children[backwardIndex] as THREE.Mesh

      const tl = gsap.timeline()
      tl.to(forwardBlock.userData, { scale: 1, duration: 0.1, ease: 'none' })
      tl.to(backwardBlock.userData, { scale: 0.000001, duration: 0.1, ease: 'none' }, '<')
      tl.eventCallback('onUpdate', () => {
        this.updateBlockScale(forwardBlock, forwardBlock.userData.scale, 'forward')
        this.updateBlockScale(backwardBlock, backwardBlock.userData.scale, 'backward')
      })
      tl.eventCallback('onComplete', () => {
        const end = this.calcEnd(walker, forwardBlock.userData.end)
        this.updateBlock(backwardBlock, forwardBlock.userData.end, end)

        if (walker.userData.currentIndex < walker.children.length - 1) walker.userData.currentIndex++
        else walker.userData.currentIndex = 0

        walker.userData.readyScaleAnimation = true
      })
    }
  }

  private anime = () => {
    this.walkers.children.forEach((walker) => {
      this.walk(walker as THREE.Group)
    })

    controls.update()
    gl.render()
  }

  // ----------------------------------
  // dispose
  dispose() {
    gl.dispose()
  }
}
