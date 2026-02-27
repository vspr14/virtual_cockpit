import SwiftUI

struct ThrottleSlider: View {
    @Binding var value: Double
    let profile: Profile?
    var onEditingChanged: (Bool) -> Void

    var body: some View {
        GeometryReader { geometry in
            let trackHeight = geometry.size.height
            let trackWidth = geometry.size.width
            let thumbWidth: CGFloat = 75
            let thumbHeight: CGFloat = 55
            let usableHeight = trackHeight - thumbHeight
            let thumbY = (1.0 - value) * usableHeight + thumbHeight / 2

            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(red: 238/255, green: 238/255, blue: 238/255))
                    .frame(width: thumbWidth, height: thumbHeight)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(red: 68/255, green: 68/255, blue: 68/255), lineWidth: 4)
                    )
                    .position(x: trackWidth / 2, y: thumbY)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { gesture in
                                let clampedY = max(thumbHeight / 2, min(trackHeight - thumbHeight / 2, gesture.location.y))
                                let newValue = 1.0 - Double((clampedY - thumbHeight / 2) / usableHeight)
                                value = max(0, min(1, newValue))
                                onEditingChanged(true)
                            }
                            .onEnded { _ in
                                onEditingChanged(false)
                            }
                    )
            }
            .frame(width: trackWidth, height: trackHeight)
        }
    }
}


