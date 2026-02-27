import SwiftUI

struct VerticalSlider: View {
    @Binding var value: Double
    let rotation: Double
    let snapToDetents: [Profile.FlapDetent]?
    var onEditingChanged: (Bool) -> Void

    init(value: Binding<Double>, rotation: Double = -90, snapToDetents: [Profile.FlapDetent]? = nil, onEditingChanged: @escaping (Bool) -> Void) {
        self._value = value
        self.rotation = rotation
        self.snapToDetents = snapToDetents
        self.onEditingChanged = onEditingChanged
    }

    var body: some View {
        GeometryReader { geometry in
            let trackLength = geometry.size.height
            let trackWidth: CGFloat = 40
            let thumbWidth: CGFloat = 65
            let thumbHeight: CGFloat = 45
            let usableLength = trackLength - thumbHeight
            
            let thumbPosition: CGFloat = {
                if rotation == 90 {
                    return CGFloat(value) * usableLength + thumbHeight / 2
                } else {
                    return (1.0 - CGFloat(value)) * usableLength + thumbHeight / 2
                }
            }()

            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.black)
                    .frame(width: trackWidth, height: trackLength)
                
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(red: 238/255, green: 238/255, blue: 238/255))
                    .frame(width: thumbWidth, height: thumbHeight)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(red: 68/255, green: 68/255, blue: 68/255), lineWidth: 3)
                    )
                    .position(x: geometry.size.width / 2, y: thumbPosition)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { gesture in
                                let clampedY = max(thumbHeight / 2, min(trackLength - thumbHeight / 2, gesture.location.y))
                                let newValue: Double
                                if rotation == 90 {
                                    newValue = Double((clampedY - thumbHeight / 2) / usableLength)
                                } else {
                                    newValue = 1.0 - Double((clampedY - thumbHeight / 2) / usableLength)
                                }
                                let finalValue = max(0, min(1, newValue))
                                
                                if let detents = snapToDetents, !detents.isEmpty {
                                    let snapped = detents.min(by: { abs($0.val - finalValue) < abs($1.val - finalValue) })?.val ?? finalValue
                                    value = snapped
                                } else {
                                    value = finalValue
                                }
                                onEditingChanged(true)
                            }
                            .onEnded { _ in
                                onEditingChanged(false)
                            }
                    )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

