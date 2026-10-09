/** WhatsApp / product tour phone mock (shared by marketing pages). */

export function tourPhoneBlock({ title = 'Central Motors', idsPrefix = '' }) {
  const titleId = idsPrefix ? `${idsPrefix}PhoneTitle` : 'tourPhoneTitle';
  const chatId = idsPrefix ? `${idsPrefix}PhoneChat` : 'tourPhoneChat';
  const actionId = idsPrefix ? `${idsPrefix}PhoneAction` : 'tourPhoneAction';
  return `<div class="tour-phone-wrap">
                <div class="device-simulator device-iphone" aria-hidden="true">
                    <div class="device-frame">
                        <div class="device-btn device-btn-silent"></div>
                        <div class="device-btn device-btn-vol-up"></div>
                        <div class="device-btn device-btn-vol-down"></div>
                        <div class="device-btn device-btn-power"></div>
                        <div class="device-screen">
                            <div class="device-status-bar">
                                <span class="device-time">9:41</span>
                                <div class="device-dynamic-island"><span class="device-island-cam"></span></div>
                                <div class="device-status-icons">
                                    <i class="fa-solid fa-signal"></i>
                                    <i class="fa-solid fa-wifi"></i>
                                    <span class="device-battery"><span class="device-battery-level"></span></span>
                                </div>
                            </div>
                            <div class="tour-phone-app">
                                <div class="tour-phone-header">
                                    <span class="tour-phone-back"><i class="fa-solid fa-chevron-left"></i></span>
                                    <div class="tour-phone-avatar">S</div>
                                    <div class="tour-phone-contact">
                                        <span class="tour-phone-title" id="${titleId}">${title}</span>
                                        <span class="tour-phone-status"><span class="pulse-dot"></span> Sarah · online</span>
                                    </div>
                                    <div class="tour-phone-actions">
                                        <i class="fa-brands fa-whatsapp"></i>
                                        <i class="fa-solid fa-phone"></i>
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </div>
                                </div>
                                <div class="tour-phone-chat" id="${chatId}"></div>
                                <div class="tour-phone-action" id="${actionId}"></div>
                                <div class="tour-phone-input">
                                    <i class="fa-regular fa-face-smile"></i>
                                    <span class="tour-phone-input-field">Message</span>
                                    <i class="fa-solid fa-paperclip"></i>
                                    <span class="tour-phone-send"><i class="fa-solid fa-microphone"></i></span>
                                </div>
                            </div>
                            <div class="device-home-indicator"></div>
                        </div>
                    </div>
                    <div class="device-shadow"></div>
                </div>
            </div>`;
}
