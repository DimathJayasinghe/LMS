import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styled from "styled-components"
import { faRecordVinyl } from '@fortawesome/free-solid-svg-icons'
import { RainbowButton } from "@/components/ui/rainbow-button"


function ButtonRegister() {
    return <a href="/auth/signup">
        <RainbowButton
            className="rounded-full w-fit h-fit text-2xl inline-block m-auto outline-1 outline-black outline-offset-2 mt-10">
            {/* <FontAwesomeIcon className="text-white w-full aspect-square" icon={faRecordVinyl} /> */}
            <div className="m-5 capitalize">
                Register to class
            </div>
        </RainbowButton>
    </a>
}


export default function Header() {
    return <h1 className="z-50 text-black text-[5rem] relative text-center leading-none m-auto select-none flex flex-col">
        <div>
            Discover your path towards <br />
            <span>your goals</span>
        </div>

        <ButtonRegister />


    </h1>
}