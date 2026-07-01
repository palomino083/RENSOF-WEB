"""
Servicio de emails para ALVENT ERP.
Nota: Para producción, configurar con SMTP o SendGrid/Mailgun.
"""
from datetime import datetime
from typing import Optional
import os


class EmailService:
    """Servicio para envío de emails"""
    
    # En producción, usar variables de entorno
    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@alvent.com")
    SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")
    
    @staticmethod
    def enviar_verificacion_email(email: str, codigo: str, usuario: str) -> bool:
        """Enviar email de verificación"""
        asunto = "🔐 Código de Verificación - ALVENT"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <h2 style="color: #333; text-align: center;">Verificación de Email</h2>
                    <p style="color: #666; text-align: center; font-size: 16px;">Hola {usuario},</p>
                    
                    <p style="color: #666; text-align: center;">Tu código de verificación es:</p>
                    
                    <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 5px; color: #667eea;">{codigo}</span>
                    </div>
                    
                    <p style="color: #999; font-size: 12px; text-align: center;">Este código válido por 30 minutos.</p>
                    <p style="color: #999; font-size: 12px; text-align: center;">Si no solicitaste este email, ignóralo.</p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    <p style="color: #999; font-size: 11px; text-align: center;">ALVENT ERP POS © 2026</p>
                </div>
            </body>
        </html>
        """
        
        return EmailService._enviar_email(email, asunto, html_content)
    
    @staticmethod
    def enviar_reset_password(email: str, usuario: str, token: str, link_reset: str) -> bool:
        """Enviar email de recuperación de contraseña"""
        asunto = "🔑 Recupera tu Contraseña - ALVENT"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <h2 style="color: #333; text-align: center;">Recuperar Contraseña</h2>
                    <p style="color: #666; text-align: center; font-size: 16px;">Hola {usuario},</p>
                    
                    <p style="color: #666;">Recibimos una solicitud para recuperar tu contraseña. Haz clic en el botón de abajo:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{link_reset}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                            Recuperar Contraseña
                        </a>
                    </div>
                    
                    <p style="color: #999; font-size: 12px;">O copia este enlace en tu navegador:</p>
                    <p style="color: #667eea; font-size: 12px; word-break: break-all;">{link_reset}</p>
                    
                    <p style="color: #999; font-size: 12px;">Este enlace es válido por 30 minutos.</p>
                    <p style="color: #999; font-size: 12px;">Si no solicitaste esto, ignora este email.</p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    <p style="color: #999; font-size: 11px; text-align: center;">ALVENT ERP POS © 2026</p>
                </div>
            </body>
        </html>
        """
        
        return EmailService._enviar_email(email, asunto, html_content)
    
    @staticmethod
    def enviar_bienvenida(email: str, usuario: str, negocio: str) -> bool:
        """Enviar email de bienvenida después del registro"""
        asunto = "🎉 ¡Bienvenido a ALVENT ERP POS!"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <h2 style="color: #333; text-align: center;">¡Bienvenido a ALVENT!</h2>
                    <p style="color: #666; text-align: center; font-size: 16px;">Hola {usuario},</p>
                    
                    <p style="color: #666;">Tu cuenta ha sido creada exitosamente. Tu negocio <strong>{negocio}</strong> está listo para usar.</p>
                    
                    <h3 style="color: #667eea; margin-top: 30px;">Próximos pasos:</h3>
                    <ul style="color: #666;">
                        <li>✅ Configura tu negocio</li>
                        <li>✅ Carga tus productos</li>
                        <li>✅ Crea tu primer punto de venta</li>
                        <li>✅ Comienza a vender</li>
                    </ul>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://app.alvent.com/dashboard" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                            Ir al Dashboard
                        </a>
                    </div>
                    
                    <p style="color: #999; font-size: 12px;">Si tienes preguntas, contáctanos: soporte@alvent.com</p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    <p style="color: #999; font-size: 11px; text-align: center;">ALVENT ERP POS © 2026</p>
                </div>
            </body>
        </html>
        """
        
        return EmailService._enviar_email(email, asunto, html_content)
    
    @staticmethod
    def _enviar_email(to_email: str, asunto: str, html_content: str) -> bool:
        """
        Enviar email (método privado)
        
        Para desarrollo: solo logs
        Para producción: usar SMTP, SendGrid o similar
        """
        try:
            # Modo desarrollo: solo loguear
            if not EmailService.SENDER_PASSWORD:
                print(f"""
                📧 EMAIL SIMULADO (desarrollo)
                ─────────────────────────────
                Para: {to_email}
                Asunto: {asunto}
                Contenido: {html_content[:100]}...
                ─────────────────────────────
                """)
                return True
            
            # En producción, descomentar y configurar SMTP
            # import smtplib
            # from email.mime.text import MIMEText
            # from email.mime.multipart import MIMEMultipart
            # 
            # msg = MIMEMultipart('alternative')
            # msg['Subject'] = asunto
            # msg['From'] = EmailService.SENDER_EMAIL
            # msg['To'] = to_email
            # 
            # part = MIMEText(html_content, 'html')
            # msg.attach(part)
            # 
            # with smtplib.SMTP(EmailService.SMTP_SERVER, EmailService.SMTP_PORT) as server:
            #     server.starttls()
            #     server.login(EmailService.SENDER_EMAIL, EmailService.SENDER_PASSWORD)
            #     server.sendmail(EmailService.SENDER_EMAIL, [to_email], msg.as_string())
            
            return True
        except Exception as e:
            print(f"❌ Error al enviar email: {str(e)}")
            return False


# Instancia global
email_service = EmailService()
