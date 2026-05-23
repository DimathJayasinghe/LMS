import { TextAnimate } from "@/components/ui/text-animate";
import { TypingAnimation } from "@/components/ui/typing-animation";
import styled from "styled-components";



interface BoxAttribute {
    color: string;
    delay : number;
    id: number;
}



const Box = styled.div<BoxAttribute>`
    background-color: #fff;
    border:1px solid #eee;
    width:10%;
    aspect-ratio:1;
    position:relative;
    perspective : 1000;
    transition : all 5s ease;
  

    

    &:hover{
        background-color: ${props => props.color};
        transition:all .3s ease;
    }


`;



export default function LoginLeftSide() {
    return <div
        data-name="login-left-side"
        className="w-[70%] h-210 overflow-hidden relative bg-white flex flex-wrap perspective-distant
            after:absolute after:bottom-0 after:left-0 after:content-[' '] after:w-full after:h-30 after:bg-linear-to-b after:from-transparent after:to-white

            before:absolute before:top-0 before:left-0 before:content-[' '] before:w-full before:h-30  before:z-100 before:bg-linear-to-b before:from-white before:to-transparent
        "

        
    >
        {Array.from(new Array(100)).map((_, i) => <Box id={i} delay={Math.random() * 100}
            color={`rgba(
      ${Math.floor(Math.random() * 255)},
      ${Math.floor(Math.random() * 255)},
      ${Math.floor(Math.random() * 255)},
      0.1
    )`}
            key={i}
        />)}

        

        <div className="absolute top-[50%] left-[50%] translate-[-50%] z-5 flex justify-center items-center text-5xl text-center w-[80%] aspect-1/3  h-80 flex-col "


            style={{
                backgroundImage: `radial-gradient(
                        ellipse 300px 200px at 50% 50%,
                        white 50%,
                       transparent 80%
                    )`
            }}>

            <div className="z-10 w-[70%] top-[40%] left-[50%] flex items-center italic text-2xl">
            <span className="text-9xl translate-y-[10%] -translate-x-full opacity-15">"</span>
            <span className="opacity-50 text-center justify-center items-center">
                useful tips and suggestions for improvement
            </span>

            <span className="text-6xl translate-y-[60%] translate-x-[50%] opacity-15">"</span>

        </div>


            <TextAnimate animation="blurInUp" by="word" once className=" border-black min-h-50 h-80 text-wrap "

            >
                Your journey begins with a single step - sign up and unlock your potential.

            </TextAnimate>


        </div>


        {/* <TypingAnimation className="absolute top-[50%] left-[50%] translate-[-50%]  flex items-center text-5xl  w-[70%] aspect-square "
            style={{
                backgroundImage : `radial-gradient(
                        circle at 50% 50%,
                        #fff,
                       transparent
                    )`
            }}
        
        
        >
            Type your own name
        </TypingAnimation>  */}




    </div>
}